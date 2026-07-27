/**
 * @fileoverview Calculation engine v2 for OT (Work Order) production estimates
 *
 * Computes imposition, sheets, substrate weight, ink, CTP plates and
 * production times for offset work. v2 (demo plan §Phase 6) replaces the toy
 * model the 2026-07 audit dismantled:
 *
 *  - MULTI-FORMAT imposition with gripper margin and bleed, shared by the
 *    cost engine AND the preview (they used to disagree — audit OF-14).
 *  - PASS-THROUGH-PRESS hours: a 4/0 job on a 4-body press is ONE pass, not
 *    four (audit OF-15 — hours were overestimated up to 4×), plus explicit
 *    make-ready time per pass (audit OF-16).
 *  - PROCESS-AWARE waste: make-ready sheets per pass and setup sheets for
 *    die-cutting / hot stamping, instead of a flat 5%+50 (audit OF-17).
 *  - PER-FINISH time formulas: die-cutting 13k sheets is ~12h, not 1.3h
 *    (audit OF-19 — every finish shared one formula).
 *  - LABOR and OVERHEAD default operations from the cost catalog
 *    (audit OF-20 — quotes omitted both entirely).
 *
 * Every tunable lives in CALIBRATION so the plant can adjust from one place.
 * CALIBRATION GATE (§6.6, pending owner input): before trusting quotes
 * commercially, run 3 historical jobs picked by the plant supervisor through
 * the wizard and tune these constants until estimates land within ±10%.
 */

import type {
  OTFormData,
  OTCalculations,
  OTOperation,
  OTPricing,
  OTColorMode,
  ImpositionResult,
  MultiQuantityQuote,
} from '@/types/ot';

/* ─── Calibration (all plant-tunable constants in one place) ── */

export const CALIBRATION = {
  /** Print-sheet formats the plant actually buys/cuts, in cm. */
  SHEET_FORMATS: [
    { w: 70, h: 100, label: '70×100' },
    { w: 77, h: 110, label: '77×110' },
    { w: 55, h: 77, label: '55×77' },
    { w: 50, h: 70, label: '50×70' },
  ],
  /** Gripper (pinza) — unprintable strip along one long edge, cm. */
  GRIPPER_CM: 1.2,
  /** Bleed (sangrado) per side, cm. */
  BLEED_CM: 0.3,
  /** Running spoilage on top of make-ready, fraction. */
  BASE_WASTE_PCT: 0.02,
  /** Make-ready sheets consumed per press pass. */
  MAKEREADY_SHEETS_PER_PASS: 120,
  /** Extra setup sheets when the job is die-cut / hot-stamped. */
  DIE_SETUP_SHEETS: 150,
  HOTSTAMP_SETUP_SHEETS: 100,
  /** Make-ready (alistamiento) time per press pass, hours. */
  MAKEREADY_HOURS_PER_PASS: 0.5,
  /** Assumed press bodies when no machine is selected yet (the plant's main
   *  press is a 4-colour) — the wizard overrides with the real machine. */
  DEFAULT_PRESS_BODIES: 4,
  /** Fallback running speed when the machine has no nominal speed. */
  DEFAULT_SHEETS_PER_HOUR: 3000,
  /** Per-finish time model: fixed setup + sheets/hour throughput. */
  FINISH_RATES: {
    corte: { setupH: 0.3, sheetsPerHour: 3000 },
    troquelado: { setupH: 1.5, sheetsPerHour: 1200 },
    plegado: { setupH: 0.5, sheetsPerHour: 3000 },
    pegado: { setupH: 0.5, sheetsPerHour: 2500 },
    laminado: { setupH: 0.5, sheetsPerHour: 2000 },
    barniz: { setupH: 0.3, sheetsPerHour: 4000 },
    relieve: { setupH: 1.0, sheetsPerHour: 1000 },
    perforado: { setupH: 0.3, sheetsPerHour: 3000 },
    hot_stamping: { setupH: 1.5, sheetsPerHour: 800 },
    uv_localizado: { setupH: 1.0, sheetsPerHour: 1500 },
    numeracion: { setupH: 0.3, sheetsPerHour: 2500 },
  } as Record<string, { setupH: number; sheetsPerHour: number }>,
} as const;

/**
 * Base ink load in kg per 70×100 sheet per colour pass, at *medium* coverage
 * on a *coated* stock; scaled by the chosen format's area, coverage class and
 * substrate absorbency.
 */
const INK_KG_PER_SHEET_70x100 = 0.003;
const REF_SHEET_AREA_M2 = 0.7; // 70×100 cm

const INK_COVERAGE_FACTOR: Record<InkCoverage, number> = {
  light: 0.5,
  medium: 1.0,
  heavy: 1.8,
};

const SUBSTRATE_INK_FACTOR: Record<string, number> = {
  couche: 1.0, cauche: 1.0,
  cartulina: 1.15,
  adhesivo: 1.1,
  bond: 1.35,
  kraft: 1.4,
  vinilo: 0.9,
  otro: 1.1,
};

/** Fixed make-ready ink laid down per colour, independent of run length. */
const INK_MAKEREADY_KG_PER_COLOR = 0.1;

export type InkCoverage = 'light' | 'medium' | 'heavy';

/** Optional real-world inputs that sharpen the estimate. */
export interface OTCalcOptions {
  /** Ink coverage class of the artwork; defaults to 'medium'. */
  inkCoverage?: InkCoverage;
  /** Selected machine's real speed (nominal_speed_sheets_hr). */
  machineSpeedSheetsHr?: number;
  /** Selected machine's colour bodies (machines.colors) — drives the
   *  pass-through-press model. Defaults to DEFAULT_PRESS_BODIES. */
  pressBodies?: number;
}

function substrateInkFactor(substrate: string): number {
  return SUBSTRATE_INK_FACTOR[substrate] ?? 1.1;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ─── Helpers ───────────────────────────────────────────────── */

function colorCount(mode: OTColorMode): number {
  switch (mode) {
    case 'cmyk': return 4;
    case 'cmyk_pantone': return 5;
    case '3_color': return 3;
    case '2_color': return 2;
    case '1_color': return 1;
    case 'sin_impresion': return 0;
  }
}

/** Press passes for a job: colours per side ÷ press bodies, per side. */
function pressPasses(front: number, back: number, bodies: number): number {
  const b = Math.max(1, bodies);
  const fp = front > 0 ? Math.ceil(front / b) : 0;
  const bp = back > 0 ? Math.ceil(back / b) : 0;
  return fp + bp;
}

/** Per-finish time: fixed setup + throughput over the run. */
export function finishHoursFor(finishKey: string, sheets: number): number {
  const rate = CALIBRATION.FINISH_RATES[finishKey] ?? { setupH: 0.5, sheetsPerHour: 2500 };
  return round2(rate.setupH + sheets / rate.sheetsPerHour);
}

/* ─── Imposition (single model: engine AND preview use this) ── */

/**
 * Best imposition across the plant's sheet formats, honouring gripper and
 * bleed. Chosen by sheet utilization (ties → more poses). `sheets_needed`
 * is the NET run (qty ÷ poses) — process waste is added by
 * computeOTCalculations, not here.
 */
export function computeImposition(
  widthCm: number,
  heightCm: number,
  quantity: number
): ImpositionResult {
  const { SHEET_FORMATS, GRIPPER_CM, BLEED_CM } = CALIBRATION;

  if (widthCm <= 0 || heightCm <= 0) {
    const f = SHEET_FORMATS[0];
    return {
      poses_per_sheet: 1, cols: 1, rows: 1,
      waste_pct: 0, sheet_utilization_pct: 100,
      sheets_needed: Math.max(1, quantity), rotated: false,
      format_label: f.label, format_w: f.w, format_h: f.h,
    };
  }

  const wB = widthCm + BLEED_CM * 2;
  const hB = heightCm + BLEED_CM * 2;

  let best: ImpositionResult | null = null;
  for (const f of SHEET_FORMATS) {
    const usableH = f.h - GRIPPER_CM; // gripper eats one edge
    for (const rotated of [false, true]) {
      const pw = rotated ? hB : wB;
      const ph = rotated ? wB : hB;
      const cols = Math.floor(f.w / pw);
      const rows = Math.floor(usableH / ph);
      const poses = cols * rows;
      if (poses <= 0) continue;
      const utilization = round2((poses * widthCm * heightCm) / (f.w * f.h) * 100);
      const candidate: ImpositionResult = {
        poses_per_sheet: poses, cols, rows, rotated,
        sheet_utilization_pct: utilization,
        waste_pct: round2(100 - utilization),
        sheets_needed: Math.max(1, Math.ceil(quantity / poses)),
        format_label: f.label, format_w: f.w, format_h: f.h,
      };
      if (
        !best ||
        candidate.sheet_utilization_pct > best.sheet_utilization_pct ||
        (candidate.sheet_utilization_pct === best.sheet_utilization_pct &&
          candidate.poses_per_sheet > best.poses_per_sheet)
      ) {
        best = candidate;
      }
    }
  }

  if (!best) {
    // Piece larger than every format: 1 pose on the biggest sheet.
    const f = SHEET_FORMATS.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b));
    best = {
      poses_per_sheet: 1, cols: 1, rows: 1, rotated: false,
      sheet_utilization_pct: round2((widthCm * heightCm) / (f.w * f.h) * 100),
      waste_pct: 0,
      sheets_needed: Math.max(1, quantity),
      format_label: f.label, format_w: f.w, format_h: f.h,
    };
  }
  return best;
}

/* ─── Main calculation ──────────────────────────────────────── */

export function computeOTCalculations(form: OTFormData, opts: OTCalcOptions = {}): OTCalculations {
  const { quantity, width_cm, height_cm, grammage_gsm, color_front, color_back, finishes, substrate_type } = form;
  const C = CALIBRATION;

  // Imposition — same model the preview shows (audit OF-14: they diverged).
  const impo = computeImposition(width_cm, height_cm, quantity);
  const rawSheets = impo.sheets_needed;
  const sheetW = impo.format_w ?? 70;
  const sheetH = impo.format_h ?? 100;

  // Press passes (pass-through-press: 4/0 on a 4-body press = 1 pass).
  const frontColors = colorCount(color_front);
  const backColors = colorCount(color_back);
  const bodies = opts.pressBodies && opts.pressBodies > 0 ? opts.pressBodies : C.DEFAULT_PRESS_BODIES;
  const passes = pressPasses(frontColors, backColors, bodies);

  // Process-aware waste: base spoilage + make-ready per pass + finish setups.
  const setupSheets =
    passes * C.MAKEREADY_SHEETS_PER_PASS +
    (finishes.finish_troquelado ? C.DIE_SETUP_SHEETS : 0) +
    (finishes.finish_hot_stamping ? C.HOTSTAMP_SETUP_SHEETS : 0);
  const totalSheets = Math.ceil(rawSheets * (1 + C.BASE_WASTE_PCT)) + setupSheets;

  // Substrate weight on the CHOSEN format (not a hardcoded 70×100).
  const sheetAreaM2 = (sheetW / 100) * (sheetH / 100);
  const substrateKg = round2((totalSheets * sheetAreaM2 * grammage_gsm) / 1000);

  // Ink — colour passes × coverage × absorbency, scaled by sheet area.
  const totalColorPasses = frontColors + backColors;
  const coverageFactor = INK_COVERAGE_FACTOR[opts.inkCoverage ?? 'medium'];
  const substrateFactor = substrateInkFactor(substrate_type || 'otro');
  const inkPerSheet = INK_KG_PER_SHEET_70x100 * (sheetAreaM2 / REF_SHEET_AREA_M2);
  const inkVariable = totalSheets * inkPerSheet * totalColorPasses * coverageFactor * substrateFactor;
  const inkMakeReady = totalColorPasses * INK_MAKEREADY_KG_PER_COLOR;
  const inkKg = totalColorPasses > 0 ? Math.round((inkVariable + inkMakeReady) * 1000) / 1000 : 0;

  // CTP plates (one per colour per side; work-and-turn montaje is a manual
  // decision the plant applies by editing operations — not auto-assumed).
  const plates = totalColorPasses;

  // Print time = make-ready per pass + run time per pass at real speed.
  const speed = opts.machineSpeedSheetsHr && opts.machineSpeedSheetsHr > 0
    ? opts.machineSpeedSheetsHr
    : C.DEFAULT_SHEETS_PER_HOUR;
  const printHours = passes > 0
    ? round2(passes * C.MAKEREADY_HOURS_PER_PASS + (passes * totalSheets) / speed)
    : 0;

  // Finishing: per-finish formulas (die-cutting ≠ varnish — audit OF-19).
  const activeFinishKeys = Object.entries(finishes)
    .filter(([, v]) => v)
    .map(([k]) => k.replace(/^finish_/, ''));
  const finishHours = round2(
    activeFinishKeys.reduce((sum, key) => sum + finishHoursFor(key, totalSheets), 0)
  );

  return {
    calc_sheets: totalSheets,
    calc_substrate_kg: substrateKg,
    calc_ink_kg: inkKg,
    calc_plates: plates,
    calc_print_hours: printHours,
    calc_finish_hours: finishHours,
  };
}

/* ─── Default operations from calculations ──────────────────── */

/** Unit cost defaults — overridden by the DB cost catalog when resolvable. */
export const DEFAULT_COSTS = {
  substrate_per_kg: 1500,
  ink_per_kg: 31915,
  plate_per_unit: 8500,
  offset_print_per_hour: 25000,
  cut_per_hour: 2500,
  troquelado_per_hour: 5000,
  plegado_per_hour: 3000,
  pegado_per_hour: 4000,
  laminado_per_hour: 3500,
  barniz_per_hour: 3000,
  relieve_per_hour: 6000,
  perforado_per_hour: 2000,
  hot_stamping_per_hour: 8000,
  uv_localizado_per_hour: 7000,
  numeracion_per_hour: 2500,
  // Labor + overhead (audit OF-20: quotes omitted both; the catalog carries
  // real rates — Operador de Prensa, Operador de Terminaciones, Gastos
  // Generales % — which the resolver maps onto these keys).
  press_labor_per_hour: 8500,
  finish_labor_per_hour: 6500,
  overhead_pct: 8,
};

export type CostOverrides = Partial<typeof DEFAULT_COSTS>;

export function generateDefaultOperations(
  form: OTFormData,
  calcs: OTCalculations,
  costOverrides: CostOverrides = {}
): OTOperation[] {
  const RATES = { ...DEFAULT_COSTS, ...costOverrides };
  const ops: OTOperation[] = [];
  let order = 0;
  const push = (category: OTOperation['category'], name: string, unit: string, quantity: number, unit_cost: number) => {
    ops.push({
      id: crypto.randomUUID(),
      category, name, unit,
      quantity, unit_cost,
      total_cost: Math.round(quantity * unit_cost),
      sort_order: order++,
    });
  };

  // ── Materials ──
  if (calcs.calc_substrate_kg > 0) push('materiales', 'Sustrato/Papel', 'kg', calcs.calc_substrate_kg, RATES.substrate_per_kg);
  if (calcs.calc_ink_kg > 0) push('materiales', 'Tintas', 'kg', calcs.calc_ink_kg, RATES.ink_per_kg);
  if (calcs.calc_plates > 0) push('materiales', 'Placas CTP', 'und', calcs.calc_plates, RATES.plate_per_unit);

  // ── Printing (machine hour incl. make-ready) + press labor ──
  const totalColorPasses = colorCount(form.color_front) + colorCount(form.color_back);
  if (totalColorPasses > 0 && calcs.calc_print_hours > 0) {
    push('impresion', 'Impresión Offset', 'hrs', calcs.calc_print_hours, RATES.offset_print_per_hour);
    push('impresion', 'Operador de Prensa', 'hrs', calcs.calc_print_hours, RATES.press_labor_per_hour);
  }

  // ── Finishing: cut always, then each active finish with its OWN hours ──
  const cutHours = finishHoursFor('corte', calcs.calc_sheets);
  push('terminaciones', 'Corte y Guillotinado', 'hrs', cutHours, RATES.cut_per_hour);

  const finishMap: Array<{ key: keyof typeof form.finishes; rateKey: string; name: string; costKey: keyof typeof DEFAULT_COSTS }> = [
    { key: 'finish_troquelado', rateKey: 'troquelado', name: 'Troquelado', costKey: 'troquelado_per_hour' },
    { key: 'finish_plegado', rateKey: 'plegado', name: 'Plegado', costKey: 'plegado_per_hour' },
    { key: 'finish_pegado', rateKey: 'pegado', name: 'Pegado', costKey: 'pegado_per_hour' },
    { key: 'finish_laminado', rateKey: 'laminado', name: 'Laminado', costKey: 'laminado_per_hour' },
    { key: 'finish_barniz', rateKey: 'barniz', name: 'Barniz', costKey: 'barniz_per_hour' },
    { key: 'finish_relieve', rateKey: 'relieve', name: 'Relieve', costKey: 'relieve_per_hour' },
    { key: 'finish_perforado', rateKey: 'perforado', name: 'Perforado', costKey: 'perforado_per_hour' },
    { key: 'finish_hot_stamping', rateKey: 'hot_stamping', name: 'Hot Stamping', costKey: 'hot_stamping_per_hour' },
    { key: 'finish_uv_localizado', rateKey: 'uv_localizado', name: 'UV Localizado', costKey: 'uv_localizado_per_hour' },
    { key: 'finish_numeracion', rateKey: 'numeracion', name: 'Numeración', costKey: 'numeracion_per_hour' },
  ];

  let finishLaborHours = cutHours;
  for (const fm of finishMap) {
    if (form.finishes[fm.key]) {
      const hours = finishHoursFor(fm.rateKey, calcs.calc_sheets);
      finishLaborHours += hours;
      push('terminaciones', fm.name, 'hrs', hours, RATES[fm.costKey]);
    }
  }
  if (finishLaborHours > 0) {
    push('terminaciones', 'Operador de Terminaciones', 'hrs', round2(finishLaborHours), RATES.finish_labor_per_hour);
  }

  // ── Overhead: % over everything above (catalog 'Gastos Generales') ──
  const subtotal = ops.reduce((s, op) => s + op.total_cost, 0);
  const overheadAmount = Math.round(subtotal * (RATES.overhead_pct / 100));
  if (overheadAmount > 0) {
    push('otros', `Gastos Generales (${RATES.overhead_pct}%)`, 'global', 1, overheadAmount);
  }

  return ops;
}

/* ─── Pricing calculation ───────────────────────────────────── */

export function computeOTPricing(
  operations: OTOperation[],
  quantity: number,
  marginPct: number = 10,
  incrementPct: number = 10,
  commissionPct: number = 1
): OTPricing {
  const subtotal = operations.reduce((sum, op) => sum + op.total_cost, 0);
  const marginAmount = Math.round(subtotal * marginPct / 100);
  const afterMargin = subtotal + marginAmount;
  const incrementAmount = Math.round(afterMargin * incrementPct / 100);
  const afterIncrement = afterMargin + incrementAmount;
  const commissionAmount = Math.round(afterIncrement * commissionPct / 100);
  const totalPrice = afterIncrement + commissionAmount;
  const unitPrice = quantity > 0 ? Math.round(totalPrice / quantity) : 0;

  return {
    subtotal: Math.round(subtotal),
    margin_pct: marginPct,
    margin_amount: marginAmount,
    increment_pct: incrementPct,
    increment_amount: incrementAmount,
    commission_pct: commissionPct,
    commission_amount: commissionAmount,
    total_price: totalPrice,
    unit_price: unitPrice,
  };
}

/* ─── Multi-quantity quoting ────────────────────────────────── */

/**
 * Price quotes for multiple quantities. Fixed costs (plates, per-pass setups
 * embedded in hours, overhead base) don't rescale perfectly here — this is a
 * commercial approximation: plates fixed, everything else proportional.
 */
/**
 * Precio para varias cantidades — el "¿y si llevo más?" del cliente.
 *
 * Antes esto escalaba linealmente todo salvo las placas. El problema: las
 * operaciones que produce el motor son AGREGADOS. "Sustrato/Papel" incluye los
 * pliegos de alistamiento (120 por pasada) además de los de tiraje, y
 * "Impresión Offset" incluye la media hora de alistamiento por pasada. Al
 * escalar ×10 se cobraba también ×10 el alistamiento — exactamente al revés de
 * cómo funciona un quiebre por cantidad.
 *
 * Medido sobre 10.000 → 100.000 etiquetas: el modelo escalado daba 31 → 28 por
 * unidad (casi ninguna baja), cuando la economía real da 31 → 15. Un impresor
 * detecta esa tabla al primer vistazo, porque todo el argumento de vender más
 * volumen es que el alistamiento se reparte.
 *
 * Ahora se vuelve a correr el motor por cada cantidad. Es más caro en CPU y es
 * la única forma honesta: el alistamiento se amortiza solo porque el modelo ya
 * lo trata como costo por pasada, no por unidad.
 */
export function computeMultiQuantityQuotes(
  form: OTFormData,
  quantities: number[],
  marginPct: number = 10,
  incrementPct: number = 10,
  commissionPct: number = 1,
  opts: OTCalcOptions = {},
  costOverrides: CostOverrides = {}
): MultiQuantityQuote[] {
  return quantities
    .filter((qty) => qty > 0)
    .map((qty) => {
      const scopedForm: OTFormData = { ...form, quantity: qty };
      const calcs = computeOTCalculations(scopedForm, opts);
      const ops = generateDefaultOperations(scopedForm, calcs, costOverrides);
      const pricing = computeOTPricing(ops, qty, marginPct, incrementPct, commissionPct);

      return {
        quantity: qty,
        total_price: Math.round(pricing.total_price),
        unit_price: Math.round(pricing.unit_price),
      };
    });
}
