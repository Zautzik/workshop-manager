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
  /**
   * Pliegos que pueden entrar a una prensa.
   *
   * Los cuatro primeros son formatos de compra que van directo a máquina grande.
   * Los siguientes son de MEDIA PRENSA: no se compran así, se obtienen cortando
   * un pliego de compra en la guillotina. Existen porque las dos únicas offset
   * del taller son Ryobi 524GS, con área máxima de impresión de 37 × 52 cm —
   * ninguno de los cuatro formatos de compra le cabe (auditoría 2026-07).
   *
   * `from` + `upPerParent` no son decoración: el corte previo de resma es una
   * operación de guillotina con tiempo y merma que antes no se costeaba.
   */
  SHEET_FORMATS: [
    { w: 70, h: 100, label: '70×100', from: null as string | null, upPerParent: 1 },
    { w: 77, h: 110, label: '77×110', from: null as string | null, upPerParent: 1 },
    { w: 55, h: 77, label: '55×77', from: null as string | null, upPerParent: 1 },
    { w: 50, h: 70, label: '50×70', from: null as string | null, upPerParent: 1 },
    // ── Media prensa (Ryobi 524GS y similares) ──
    { w: 35, h: 50, label: '35×50', from: '70×100' as string | null, upPerParent: 4 },
    { w: 35, h: 50, label: '35×50', from: '50×70' as string | null, upPerParent: 2 },
    { w: 27.5, h: 38.5, label: '27,5×38,5', from: '55×77' as string | null, upPerParent: 2 },
    { w: 25, h: 35, label: '25×35', from: '70×100' as string | null, upPerParent: 8 },
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
  /** Velocidad de la digital cuando no se eligió una máquina concreta. */
  DEFAULT_DIGITAL_SHEETS_PER_HOUR: 1400,
  /** Per-finish time model: fixed setup + sheets/hour throughput. */
  FINISH_RATES: {
    corte: { setupH: 0.3, sheetsPerHour: 3000 },
    // La troqueladora del taller declara 3.500 pliegos/hora óptimos en
    // `machines.optimal_speed_sheets_hr`. Aquí decía 1.200: la misma máquina
    // costeada tres veces más lenta de lo que la propia ficha afirma, que en un
    // tiraje de 100.000 pliegos son 57 horas de troquelado inventadas.
    troquelado: { setupH: 1.5, sheetsPerHour: 3500 },
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
 *
 * 0,00085 kg sobre 0,7 m² son 1,2 g/m² por color, que es la banda con la que se
 * trabaja en offset a cobertura media. Antes decía 0,003 — 4,3 g/m² por color,
 * un depósito de tinta de solidez plena en todo el pliego. La consecuencia no
 * era académica: en un estuche de 200.000 unidades la tinta salía $11,3 millones
 * contra $15,0 de cartulina, casi a la par del papel. En una imprenta la tinta
 * es del orden del 5% de la venta y el papel del 35%; ninguna cotización con esa
 * proporción sobrevive la mirada de un impresor.
 */
const INK_KG_PER_SHEET_70x100 = 0.00085;
const REF_SHEET_AREA_M2 = 0.7; // 70×100 cm

/**
 * La cobertura es una propiedad de LA PLANCHA, no del trabajo.
 *
 * Una etiqueta de vino se imprime con un pantone de fondo a solidez plena y un
 * negro que es sólo el texto legal: la misma OT lleva una plancha cargadísima y
 * otra con una pizca. Aplicarle «alta» a las dos multiplica el negro por 1,8
 * —tinta que nadie va a comprar— y aplicarle «media» a las dos subestima el
 * fondo, que es donde está el gasto de verdad.
 *
 * `trace` es esa pizca: una plancha de sólo texto o filetes anda en 3% a 5% de
 * área cubierta. No es «liviana», es un orden de magnitud menos.
 *
 * Los factores son relativos a la cobertura media, que es la referencia con la
 * que está calibrado `INK_KG_PER_SHEET_70x100`:
 *
 *     trace   ~4% de área    0,12
 *     light   ~18%           0,5
 *     medium  ~38%           1,0   ← referencia
 *     heavy   ~75%, sólidos  1,8
 */
const INK_COVERAGE_FACTOR: Record<InkCoverage, number> = {
  trace: 0.12,
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

export type InkCoverage = 'trace' | 'light' | 'medium' | 'heavy';

/** Optional real-world inputs that sharpen the estimate. */
export interface OTCalcOptions {
  /** Cobertura del trabajo entero. Se usa para las planchas que no se detallen. */
  inkCoverage?: InkCoverage;
  /**
   * Dato variable: el trabajo pasa DOS VECES, por dos máquinas distintas.
   *
   * Es un trabajo común y el motor no lo sabía modelar. La parte igual para
   * todos —el fondo, la marca, el troquel— se tira en offset, que es barato por
   * volumen y caro de alistar. Lo que cambia en cada pieza —un nombre, un
   * número, un código— no puede ir en una plancha: se imprime después en
   * digital, que no tiene alistamiento y cobra por clic.
   *
   * La economía de las dos es opuesta, y por eso el híbrido existe: nadie tira
   * 120.000 etiquetas en digital, y nadie hace 120.000 planchas distintas.
   */
  variableData?: boolean;
  /** Velocidad de la digital, en pliegos por hora. */
  digitalSpeedSheetsHr?: number;
  /**
   * Cobertura plancha por plancha, en orden: primero las del frente, después
   * las del dorso.
   *
   * Es lo que un jefe de taller sabe mirando el arte, y lo único que permite
   * costear bien un trabajo donde una tinta va a full y otra apenas marca. Las
   * planchas que no estén en la lista usan `inkCoverage`, así que se puede
   * detallar sólo la que se sale de lo normal:
   *
   *     inkCoverage: 'medium', plateCoverage: ['heavy', 'trace']
   *     → fondo a solidez plena, negro de texto, y los demás en media
   */
  plateCoverage?: readonly InkCoverage[];
  /** Selected machine's real speed (nominal_speed_sheets_hr). */
  machineSpeedSheetsHr?: number;
  /** Área máxima imprimible de la prensa elegida — filtra los pliegos posibles. */
  pressLimit?: PressLimit | null;
  /** Selected machine's colour bodies (machines.colors) — drives the
   *  pass-through-press model. Defaults to DEFAULT_PRESS_BODIES. */
  pressBodies?: number;
}

function substrateInkFactor(substrate: string): number {
  return SUBSTRATE_INK_FACTOR[substrate] ?? 1.1;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ─── Helpers ───────────────────────────────────────────────── */

export function colorCount(mode: OTColorMode): number {
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
export function pressPasses(front: number, back: number, bodies: number): number {
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
/** Área máxima imprimible de la prensa elegida, en cm. */
export interface PressLimit {
  maxWidthCm: number;
  maxHeightCm: number;
}

/** ¿Este pliego entra en la prensa, en cualquiera de sus dos orientaciones? */
function fitsPress(f: { w: number; h: number }, limit?: PressLimit | null): boolean {
  if (!limit || !(limit.maxWidthCm > 0) || !(limit.maxHeightCm > 0)) return true;
  const { maxWidthCm: W, maxHeightCm: H } = limit;
  return (f.w <= W && f.h <= H) || (f.h <= W && f.w <= H);
}

/**
 * Imposición: cuántas piezas entran en un pliego y cuántos pliegos hacen falta.
 *
 * `limit` es el área máxima de la prensa elegida. Sin él, el cálculo elige el
 * pliego que mejor aprovecha el papel — que es como se venía haciendo, y por eso
 * proponía un 77×110 para una Ryobi 524GS que sólo toma 37×52: una imposición
 * físicamente imposible de montar, con 6× menos pliegos y la mitad de las horas
 * de prensa que el trabajo realmente pide.
 */
export function computeImposition(
  widthCm: number,
  heightCm: number,
  quantity: number,
  limit?: PressLimit | null
): ImpositionResult {
  const { SHEET_FORMATS, GRIPPER_CM, BLEED_CM } = CALIBRATION;

  // Sólo los pliegos que la máquina puede agarrar.
  const usableFormats = SHEET_FORMATS.filter((f) => fitsPress(f, limit));
  const formats = usableFormats.length > 0 ? usableFormats : SHEET_FORMATS;

  if (widthCm <= 0 || heightCm <= 0) {
    const f = formats[0];
    return {
      poses_per_sheet: 1, cols: 1, rows: 1,
      waste_pct: 0, sheet_utilization_pct: 100,
      sheets_needed: Math.max(1, quantity), rotated: false,
      format_label: f.label, format_w: f.w, format_h: f.h,
      cut_from: f.from ?? null, cuts_per_parent: f.upPerParent ?? 1,
      exceeds_press: usableFormats.length === 0,
    };
  }

  const wB = widthCm + BLEED_CM * 2;
  const hB = heightCm + BLEED_CM * 2;

  let best: ImpositionResult | null = null;
  for (const f of formats) {
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
        cut_from: f.from ?? null, cuts_per_parent: f.upPerParent ?? 1,
        exceeds_press: false,
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
    // La pieza no entra en ningún pliego que la prensa acepte. Se informa sobre
    // el mayor disponible y se marca `exceeds_press` para que la UI lo frene:
    // antes devolvía un número igual y la OT salía con una imposición imposible.
    const f = formats.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b));
    best = {
      poses_per_sheet: 1, cols: 1, rows: 1, rotated: false,
      sheet_utilization_pct: round2((widthCm * heightCm) / (f.w * f.h) * 100),
      waste_pct: 0,
      sheets_needed: Math.max(1, quantity),
      format_label: f.label, format_w: f.w, format_h: f.h,
      cut_from: f.from ?? null, cuts_per_parent: f.upPerParent ?? 1,
      exceeds_press: true,
    };
  }
  return best;
}

/* ─── Main calculation ──────────────────────────────────────── */

/**
 * Los pliegos de puesta a punto de un trabajo.
 *
 * Se exporta porque hay una segunda pregunta que los necesita: cuando una OT
 * avanza a medias, el arreglo NO se reparte — se gasta una vez y va entero con
 * el primer fragmento. Recalcularlo por fuera sería tener dos definiciones del
 * mismo número, y la de afuera se quedaría vieja el día que se calibre esta.
 */
export function makeReadySheets(
  passes: number,
  finishes: { finish_troquelado?: boolean; finish_hot_stamping?: boolean } = {},
): number {
  return (
    passes * CALIBRATION.MAKEREADY_SHEETS_PER_PASS +
    (finishes.finish_troquelado ? CALIBRATION.DIE_SETUP_SHEETS : 0) +
    (finishes.finish_hot_stamping ? CALIBRATION.HOTSTAMP_SETUP_SHEETS : 0)
  );
}

export function computeOTCalculations(form: OTFormData, opts: OTCalcOptions = {}): OTCalculations {
  const { quantity, width_cm, height_cm, grammage_gsm, color_front, color_back, finishes, substrate_type } = form;
  const C = CALIBRATION;

  // Imposition — same model the preview shows (audit OF-14: they diverged).
  const impo = computeImposition(width_cm, height_cm, quantity, opts.pressLimit);
  const rawSheets = impo.sheets_needed;
  const sheetW = impo.format_w ?? 70;
  const sheetH = impo.format_h ?? 100;

  // Press passes (pass-through-press: 4/0 on a 4-body press = 1 pass).
  const frontColors = colorCount(color_front);
  const backColors = colorCount(color_back);
  const bodies = opts.pressBodies && opts.pressBodies > 0 ? opts.pressBodies : C.DEFAULT_PRESS_BODIES;
  const passes = pressPasses(frontColors, backColors, bodies);

  // Process-aware waste: base spoilage + make-ready per pass + finish setups.
  const setupSheets = makeReadySheets(passes, finishes);
  const totalSheets = Math.ceil(rawSheets * (1 + C.BASE_WASTE_PCT)) + setupSheets;

  // Substrate weight on the CHOSEN format (not a hardcoded 70×100).
  const sheetAreaM2 = (sheetW / 100) * (sheetH / 100);
  const substrateKg = round2((totalSheets * sheetAreaM2 * grammage_gsm) / 1000);

  // Tinta — se suma PLANCHA POR PLANCHA, no colores × una cobertura.
  //
  // Sumar los factores de cada plancha en vez de multiplicar la cantidad por uno
  // solo es lo que permite que un pantone a full y un negro de texto convivan en
  // la misma OT sin que ninguno de los dos quede mal costeado. Cuando todas las
  // planchas comparten clase, la suma da idéntico a la fórmula anterior.
  const totalColorPasses = frontColors + backColors;
  const porDefecto = INK_COVERAGE_FACTOR[opts.inkCoverage ?? 'medium'];
  const coberturas = opts.plateCoverage ?? [];
  const sumaDeCoberturas = Array.from({ length: totalColorPasses }, (_, i) =>
    coberturas[i] ? INK_COVERAGE_FACTOR[coberturas[i]] : porDefecto,
  ).reduce((a, b) => a + b, 0);

  const substrateFactor = substrateInkFactor(substrate_type || 'otro');
  const inkPerSheet = INK_KG_PER_SHEET_70x100 * (sheetAreaM2 / REF_SHEET_AREA_M2);
  const inkVariable = totalSheets * inkPerSheet * sumaDeCoberturas * substrateFactor;
  // El alistamiento NO depende de la cobertura: para entrar en registro hay que
  // cargar el tintero igual, aunque la plancha después apenas marque.
  const inkMakeReady = totalColorPasses * INK_MAKEREADY_KG_PER_COLOR;
  const inkKg = totalColorPasses > 0 ? Math.round((inkVariable + inkMakeReady) * 1000) / 1000 : 0;

  // CTP plates (one per colour per side; work-and-turn montaje is a manual
  // decision the plant applies by editing operations — not auto-assumed).
  const plates = totalColorPasses;

  // Print time = make-ready per pass + run time per pass at real speed.
  const speed = opts.machineSpeedSheetsHr && opts.machineSpeedSheetsHr > 0
    ? opts.machineSpeedSheetsHr
    : C.DEFAULT_SHEETS_PER_HOUR;
  const offsetHours = passes > 0
    ? passes * C.MAKEREADY_HOURS_PER_PASS + (passes * totalSheets) / speed
    : 0;

  // La segunda pasada. La digital NO tiene alistamiento —no hay planchas que
  // montar ni registro que cuadrar, que es justo por lo que se usa para el dato
  // variable— así que son horas puras de corrida.
  const digitalHours = opts.variableData
    ? totalSheets / (opts.digitalSpeedSheetsHr && opts.digitalSpeedSheetsHr > 0
        ? opts.digitalSpeedSheetsHr
        : C.DEFAULT_DIGITAL_SHEETS_PER_HOUR)
    : 0;

  const printHours = round2(offsetHours + digitalHours);

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
  /**
   * El TROQUEL, que no es lo mismo que troquelar.
   *
   * `troquelado_per_hour` paga la máquina corriendo. Esto paga la herramienta:
   * una matriz de acero cortada a medida para esa pieza. Es un costo de UNA VEZ
   * y no se reparte por pliego — en un tiraje de 5.000 pesa diez veces más por
   * unidad que en uno de 50.000, que es justo por lo que un cliente que repite
   * paga menos sin que nadie le haga un descuento.
   *
   * La cotización sólo preguntaba SI se troquela. Un trabajo nuevo y una
   * repetición salían idénticos, cuando entre los dos hay tres o cuatro cientos
   * de miles de pesos de diferencia que alguien terminaba absorbiendo.
   *
   * PENDIENTE DE CALIBRAR con el troquelero del taller.
   */
  die_tooling: 320_000,
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
  /**
   * La digital cobra POR CLIC, no por hora.
   *
   * Un clic es un pliego que pasa. No hay alistamiento que repartir, así que el
   * costo por unidad no baja con el tiraje — que es exactamente al revés del
   * offset, y la razón por la que conviene combinarlas en vez de elegir una.
   *
   * Éste es el clic a TODO COLOR: un trabajo entero impreso en digital.
   */
  digital_click: 595,
  /**
   * El clic del dato variable, que NO es el mismo.
   *
   * Una pasada de dato variable deposita un nombre, un número o un código: negro,
   * un patch chico del pliego. Cobrarla al clic de cuatricromía multiplica por
   * cinco un costo que el taller no paga — medido sobre 120.000 etiquetas, la
   * diferencia entre $6,1 millones y $1,2.
   *
   * PENDIENTE DE CALIBRAR: es un valor por defecto razonable para negro en A3,
   * no la tarifa de este taller. Cuando el catálogo tenga su propia línea de
   * «clic variable», el resolvedor la va a preferir.
   */
  digital_variable_click: 120,
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

  // ── El troquel, cuando hay que mandarlo a hacer ──
  // Va ANTES del troquelado en la lista porque ocurre antes en el tiempo: sin
  // matriz no hay golpe. Y va como línea propia porque es lo único del trabajo
  // que no se reparte por pliego: el jefe de taller tiene que poder verlo suelto
  // para decidir si conviene el tiraje.
  if (form.finishes.finish_troquelado && form.die_new) {
    push('terminaciones', 'Troquel nuevo (herramental, una vez)', 'global', 1, RATES.die_tooling);
  }

  // ── Dato variable: la segunda pasada, por la digital ──
  // Va como operación aparte y no sumada a la de offset porque son dos máquinas
  // con dos economías distintas: el jefe de taller tiene que poder ver cuánto le
  // cuesta personalizar, que es la decisión que está tomando.
  if (form.variable_data && calcs.calc_sheets > 0) {
    push('impresion', 'Impresión Digital (dato variable)', 'clic', calcs.calc_sheets, RATES.digital_variable_click);
  }

  // ── Finishing: cut always, then each active finish with its OWN hours ──
  // Corte previo de resma: cuando el pliego de prensa sale de partir uno de
  // compra (un 35×50 es un 70×100 en cuatro), esa pasada por la guillotina
  // ocurre ANTES de imprimir y hasta ahora no se costeaba. Para alimentar una
  // media prensa es trabajo real: se cortan los pliegos comprados, no los de
  // prensa, así que el volumen es menor pero el tiempo existe.
  const impoForCut = form.imposition;
  if (impoForCut?.cut_from && (impoForCut.cuts_per_parent ?? 1) > 1) {
    const parentSheets = Math.ceil(calcs.calc_sheets / (impoForCut.cuts_per_parent ?? 1));
    const resmaHours = finishHoursFor('corte', parentSheets);
    push(
      'terminaciones',
      `Corte de resma (${impoForCut.cut_from} → ${impoForCut.format_label})`,
      'hrs',
      resmaHours,
      RATES.cut_per_hour
    );
  }

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
