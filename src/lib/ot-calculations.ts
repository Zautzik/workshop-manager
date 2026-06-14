/**
 * @fileoverview Calculation engine for OT (Work Order) production estimates
 *
 * Computes sheets needed, substrate weight, ink consumption, CTP plates,
 * and estimated production times based on product specs.
 *
 * All formulas use industry-standard approximations for offset printing.
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

/* ─── Constants ─────────────────────────────────────────────── */

/** Standard offset press sheet size in cm */
const PRESS_SHEET_WIDTH = 70;
const PRESS_SHEET_HEIGHT = 100;

/** Waste factor for offset printing (5% spoilage + setup) */
const WASTE_FACTOR = 1.05;

/** Minimum extra sheets for press setup */
const SETUP_SHEETS = 50;

/** Ink coverage per sheet in kg (approximate for offset) */
const INK_KG_PER_SHEET = 0.003;

/** Sheets per hour on offset press (average speed) */
const SHEETS_PER_HOUR = 3000;

/** Hours per finishing operation (base estimate) */
const FINISH_BASE_HOURS = 0.5;

/* ─── Helpers ───────────────────────────────────────────────── */

function colorCount(mode: OTColorMode): number {
  switch (mode) {
    case 'cmyk':
      return 4;
    case 'cmyk_pantone':
      return 5;
    case '3_color':
      return 3;
    case '2_color':
      return 2;
    case '1_color':
      return 1;
    case 'sin_impresion':
      return 0;
  }
}

/**
 * How many product pieces fit on one press sheet (poses per sheet).
 * Simple grid layout without rotation optimization.
 */
function posesPerSheet(widthCm: number, heightCm: number): number {
  if (widthCm <= 0 || heightCm <= 0) return 1;

  const landscape =
    Math.floor(PRESS_SHEET_WIDTH / widthCm) *
    Math.floor(PRESS_SHEET_HEIGHT / heightCm);

  const portrait =
    Math.floor(PRESS_SHEET_WIDTH / heightCm) *
    Math.floor(PRESS_SHEET_HEIGHT / widthCm);

  return Math.max(landscape, portrait, 1);
}

/* ─── Main calculation ──────────────────────────────────────── */

export function computeOTCalculations(form: OTFormData): OTCalculations {
  const { quantity, width_cm, height_cm, grammage_gsm, color_front, color_back, finishes } = form;

  // Sheets (pliegos)
  const poses = posesPerSheet(width_cm, height_cm);
  const rawSheets = Math.ceil(quantity / poses);
  const totalSheets = Math.max(
    Math.ceil(rawSheets * WASTE_FACTOR) + SETUP_SHEETS,
    rawSheets
  );

  // Substrate weight in kg
  // Weight = sheets × (sheet area in m²) × grammage (g/m²) / 1000
  const sheetAreaM2 = (PRESS_SHEET_WIDTH / 100) * (PRESS_SHEET_HEIGHT / 100);
  const substrateKg = Number(
    ((totalSheets * sheetAreaM2 * grammage_gsm) / 1000).toFixed(2)
  );

  // Ink consumption
  const frontColors = colorCount(color_front);
  const backColors = colorCount(color_back);
  const totalColorPasses = frontColors + backColors;
  const inkKg = Number((totalSheets * INK_KG_PER_SHEET * totalColorPasses).toFixed(3));

  // CTP plates (one plate per color per side)
  const plates = totalColorPasses;

  // Estimated print time
  const printPasses = Math.max(frontColors, 1) + (backColors > 0 ? Math.max(backColors, 1) : 0);
  const printHours = Number(((totalSheets * printPasses) / SHEETS_PER_HOUR).toFixed(2));

  // Finishing time estimate
  const activeFinishes = Object.values(finishes).filter(Boolean).length;
  const finishHours = Number((activeFinishes * FINISH_BASE_HOURS * (totalSheets / 5000)).toFixed(2));

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

/** Unit cost defaults (reasonable industry estimates in CLP-like currency) */
const DEFAULT_COSTS = {
  substrate_per_kg: 1500,
  ink_per_kg: 31915,
  plate_per_unit: 8500,
  // Offset press time. The calculation engine is offset-based (CTP plates, ink
  // per sheet, press sheets), so printing is priced per press-hour — not per
  // digital click. Adjust to your real press rate; this is a starting estimate.
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
};

export function generateDefaultOperations(
  form: OTFormData,
  calcs: OTCalculations
): OTOperation[] {
  const ops: OTOperation[] = [];
  let order = 0;

  // Substrate / Paper
  if (calcs.calc_substrate_kg > 0) {
    ops.push({
      id: crypto.randomUUID(),
      category: 'materiales',
      name: 'Sustrato/Papel',
      unit: 'kg',
      quantity: calcs.calc_substrate_kg,
      unit_cost: DEFAULT_COSTS.substrate_per_kg,
      total_cost: Math.round(calcs.calc_substrate_kg * DEFAULT_COSTS.substrate_per_kg),
      sort_order: order++,
    });
  }

  // Ink
  if (calcs.calc_ink_kg > 0) {
    ops.push({
      id: crypto.randomUUID(),
      category: 'materiales',
      name: 'Tintas',
      unit: 'kg',
      quantity: calcs.calc_ink_kg,
      unit_cost: DEFAULT_COSTS.ink_per_kg,
      total_cost: Math.round(calcs.calc_ink_kg * DEFAULT_COSTS.ink_per_kg),
      sort_order: order++,
    });
  }

  // CTP Plates
  if (calcs.calc_plates > 0) {
    ops.push({
      id: crypto.randomUUID(),
      category: 'materiales',
      name: 'Placas CTP',
      unit: 'und',
      quantity: calcs.calc_plates,
      unit_cost: DEFAULT_COSTS.plate_per_unit,
      total_cost: Math.round(calcs.calc_plates * DEFAULT_COSTS.plate_per_unit),
      sort_order: order++,
    });
  }

  // Printing — offset press time, consistent with the offset calculation
  // engine above. Only emitted when the job actually prints (it has colors);
  // a "sin impresión" job must not get a printing line.
  const totalColorPasses = colorCount(form.color_front) + colorCount(form.color_back);
  if (totalColorPasses > 0 && calcs.calc_print_hours > 0) {
    ops.push({
      id: crypto.randomUUID(),
      category: 'impresion',
      name: 'Impresión Offset',
      unit: 'hours',
      quantity: calcs.calc_print_hours,
      unit_cost: DEFAULT_COSTS.offset_print_per_hour,
      total_cost: Math.round(calcs.calc_print_hours * DEFAULT_COSTS.offset_print_per_hour),
      sort_order: order++,
    });
  }

  // Finishing operations
  const finishMap: Array<{
    key: keyof typeof form.finishes;
    name: string;
    costKey: keyof typeof DEFAULT_COSTS;
  }> = [
    { key: 'finish_troquelado', name: 'Troquelado', costKey: 'troquelado_per_hour' },
    { key: 'finish_plegado', name: 'Plegado', costKey: 'plegado_per_hour' },
    { key: 'finish_pegado', name: 'Pegado', costKey: 'pegado_per_hour' },
    { key: 'finish_laminado', name: 'Laminado', costKey: 'laminado_per_hour' },
    { key: 'finish_barniz', name: 'Barniz', costKey: 'barniz_per_hour' },
    { key: 'finish_relieve', name: 'Relieve', costKey: 'relieve_per_hour' },
    { key: 'finish_perforado', name: 'Perforado', costKey: 'perforado_per_hour' },
    { key: 'finish_hot_stamping', name: 'Hot Stamping', costKey: 'hot_stamping_per_hour' },
    { key: 'finish_uv_localizado', name: 'UV Localizado', costKey: 'uv_localizado_per_hour' },
    { key: 'finish_numeracion', name: 'Numeración', costKey: 'numeracion_per_hour' },
  ];

  // Always add cut & guillotine
  ops.push({
    id: crypto.randomUUID(),
    category: 'terminaciones',
    name: 'Corte y Guillotinado',
    unit: 'hours',
    quantity: Math.max(calcs.calc_finish_hours, 1),
    unit_cost: DEFAULT_COSTS.cut_per_hour,
    total_cost: Math.round(
      Math.max(calcs.calc_finish_hours, 1) * DEFAULT_COSTS.cut_per_hour
    ),
    sort_order: order++,
  });

  for (const fm of finishMap) {
    if (form.finishes[fm.key]) {
      const hours = Math.max(calcs.calc_finish_hours, 1);
      ops.push({
        id: crypto.randomUUID(),
        category: 'terminaciones',
        name: fm.name,
        unit: 'hours',
        quantity: hours,
        unit_cost: DEFAULT_COSTS[fm.costKey],
        total_cost: Math.round(hours * DEFAULT_COSTS[fm.costKey]),
        sort_order: order++,
      });
    }
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

/* ─── Imposition Optimizer ──────────────────────────────────── */

/**
 * Compute optimal imposition layout on a 70×100 cm press sheet.
 * Tests both orientations and returns the best grid with utilization stats.
 */
export function computeImposition(
  widthCm: number,
  heightCm: number,
  quantity: number
): ImpositionResult {
  if (widthCm <= 0 || heightCm <= 0) {
    return {
      poses_per_sheet: 1,
      cols: 1,
      rows: 1,
      waste_pct: 0,
      sheet_utilization_pct: 100,
      sheets_needed: quantity,
      rotated: false,
    };
  }

  // Add 3mm bleed on each side
  const wBleed = widthCm + 0.6;
  const hBleed = heightCm + 0.6;

  // Test normal orientation
  const colsNormal = Math.floor(PRESS_SHEET_WIDTH / wBleed);
  const rowsNormal = Math.floor(PRESS_SHEET_HEIGHT / hBleed);
  const posesNormal = colsNormal * rowsNormal;

  // Test rotated 90°
  const colsRotated = Math.floor(PRESS_SHEET_WIDTH / hBleed);
  const rowsRotated = Math.floor(PRESS_SHEET_HEIGHT / wBleed);
  const posesRotated = colsRotated * rowsRotated;

  const rotated = posesRotated > posesNormal;
  const cols = rotated ? colsRotated : colsNormal;
  const rows = rotated ? rowsRotated : rowsNormal;
  const poses = Math.max(rotated ? posesRotated : posesNormal, 1);

  const usedArea = poses * widthCm * heightCm;
  const sheetArea = PRESS_SHEET_WIDTH * PRESS_SHEET_HEIGHT;
  const utilization = Number(((usedArea / sheetArea) * 100).toFixed(1));
  const wastePct = Number((100 - utilization).toFixed(1));

  const rawSheets = Math.ceil(quantity / poses);
  const totalSheets = Math.ceil(rawSheets * WASTE_FACTOR) + SETUP_SHEETS;

  return {
    poses_per_sheet: poses,
    cols,
    rows,
    waste_pct: wastePct,
    sheet_utilization_pct: utilization,
    sheets_needed: totalSheets,
    rotated,
  };
}

/* ─── Multi-quantity quoting ────────────────────────────────── */

/**
 * Generate price quotes for multiple quantities.
 * Uses the same operations but scales material costs proportionally.
 * Fixed costs (plates, setup) stay constant — only variable costs scale.
 */
export function computeMultiQuantityQuotes(
  baseQuantity: number,
  baseOperations: OTOperation[],
  quantities: number[],
  marginPct: number = 10,
  incrementPct: number = 10,
  commissionPct: number = 1
): MultiQuantityQuote[] {
  // Classify operations as fixed vs variable
  const fixedCategories = new Set(['materiales']); // plates are fixed but listed under materials
  const fixedOpNames = new Set(['Placas CTP']); // These don't scale

  const baseCosts = baseOperations.reduce(
    (acc, op) => {
      if (fixedOpNames.has(op.name)) {
        acc.fixed += op.total_cost;
      } else {
        acc.variable += op.total_cost;
      }
      return acc;
    },
    { fixed: 0, variable: 0 }
  );

  return quantities.map((qty) => {
    const scaleFactor = baseQuantity > 0 ? qty / baseQuantity : 1;
    const scaledVariable = baseCosts.variable * scaleFactor;
    const subtotal = baseCosts.fixed + scaledVariable;

    const marginAmt = subtotal * marginPct / 100;
    const afterMargin = subtotal + marginAmt;
    const incAmt = afterMargin * incrementPct / 100;
    const afterInc = afterMargin + incAmt;
    const commAmt = afterInc * commissionPct / 100;
    const total = Math.round(afterInc + commAmt);
    const unit = qty > 0 ? Math.round(total / qty) : 0;

    return { quantity: qty, total_price: total, unit_price: unit };
  });
}
