/**
 * @fileoverview WhatsApp Cost Inference Engine
 *
 * Takes parsed WhatsApp production data + OT context and infers
 * real production costs including materials, time, labour, and energy.
 *
 * Uses the same cost center rates as the production cost engine
 * but works with partial/incomplete data from operator messages.
 */

import type { ParsedProductionData, InferredCostData, InferredCostLine } from '@/types/whatsapp-production';

/* ─── Default Cost Rates (CLP) ───────────────────────────────── */

const DEFAULT_RATES = {
  paper_per_kg: 1500,
  ink_per_kg: 31915,
  offset_per_hour: 55000,
  digital_per_click: 595,
  guillotine_per_hour: 18000,
  finishing_per_hour: 12000,
  operator_press_per_hour: 8500,
  operator_guillotine_per_hour: 7000,
  operator_finishing_per_hour: 6500,
  energy_per_hour: 3500,
} as const;

/* ─── Constants ──────────────────────────────────────────────── */

const SHEETS_PER_HOUR = 3000;
const INK_KG_PER_SHEET_PER_COLOR = 0.0008;
const STANDARD_SHEET_AREA_M2 = 0.70; // 70x100cm
const DEFAULT_GRAMMAGE = 140;
const DEFAULT_COLORS = 4;
const FINISH_HOURS_PER_1000 = 0.4;

/* ─── OT Context (optional, enriches inference) ──────────────── */

export interface OTContext {
  /** OT number */
  ot_number: string;
  /** Quantity ordered */
  quantity?: number;
  /** Machine type from OT */
  machine_type?: string;
  /** Color config e.g. "4/4" */
  color_config?: string;
  /** Paper type */
  substrate_type?: string;
  /** Grammage */
  grammage_gsm?: number;
  /** Sheet dimensions */
  sheet_width?: number;
  sheet_height?: number;
  /** Tiraje (press run) */
  tiraje?: number;
}

/* ─── Parse color config ─────────────────────────────────────── */

function parseColorCount(config: string | null | undefined): number {
  if (!config) return DEFAULT_COLORS;
  const match = config.match(/(\d)\/(\d)/);
  if (match) return parseInt(match[1]) + parseInt(match[2]);
  const single = config.match(/(\d)/);
  if (single) return parseInt(single[1]);
  return DEFAULT_COLORS;
}

/* ─── Main Inference Engine ──────────────────────────────────── */

/**
 * Infer production costs from parsed WhatsApp data.
 *
 * @param parsed - Parsed production data from operator message
 * @param elapsedMinutes - Time between START and END messages
 * @param otContext - Optional OT context for better accuracy
 */
export function inferProductionCosts(
  parsed: ParsedProductionData,
  elapsedMinutes: number | null,
  otContext?: OTContext | null,
): InferredCostData {
  const lines: InferredCostLine[] = [];

  // Determine base values — prefer parsed, fallback to OT context, then defaults
  // If only 'buenos' is available, reconstruct total sheets: buenos + merma
  const pliegos = parsed.pliegos_produced
    ?? (parsed.buenos && parsed.merma ? parsed.buenos + parsed.merma : null)
    ?? parsed.buenos
    ?? otContext?.tiraje
    ?? otContext?.quantity
    ?? 0;

  const grammage = otContext?.grammage_gsm ?? DEFAULT_GRAMMAGE;
  const colorConfig = parsed.colors_mentioned ?? otContext?.color_config;
  const totalColors = parseColorCount(colorConfig);
  const machineType = parsed.machine_mentioned ?? otContext?.machine_type ?? 'offset_4_colores';
  const isDigital = machineType.includes('digital');

  // Calculate elapsed hours
  const elapsedHours = elapsedMinutes
    ? Number((elapsedMinutes / 60).toFixed(2))
    : pliegos > 0
      ? Number((pliegos / SHEETS_PER_HOUR).toFixed(2))
      : 1;

  // ── 1. Paper Cost ────────────────────────────────────────
  if (pliegos > 0) {
    const sheetWidth = otContext?.sheet_width ?? 72;
    const sheetHeight = otContext?.sheet_height ?? 102;
    const sheetAreaM2 = (sheetWidth / 100) * (sheetHeight / 100);
    const totalSheets = pliegos + (parsed.merma ?? 0);
    const paperKg = Number(((totalSheets * sheetAreaM2 * grammage) / 1000).toFixed(2));
    const paperName = parsed.paper_mentioned ?? otContext?.substrate_type ?? 'Papel';

    lines.push({
      category: 'papel',
      description: `${paperName} ${grammage} grs (${totalSheets} pliegos)`,
      quantity: paperKg,
      unit: 'kg',
      unit_cost: DEFAULT_RATES.paper_per_kg,
      total_cost: Number((paperKg * DEFAULT_RATES.paper_per_kg).toFixed(0)),
      source: parsed.pliegos_produced !== null ? 'parsed' : 'inferred',
    });
  }

  // ── 2. Ink Cost ──────────────────────────────────────────
  if (pliegos > 0 && totalColors > 0) {
    const inkKg = Number((pliegos * INK_KG_PER_SHEET_PER_COLOR * totalColors).toFixed(3));
    lines.push({
      category: 'tinta',
      description: `Tinta (${totalColors} colores × ${pliegos} pliegos)`,
      quantity: inkKg,
      unit: 'kg',
      unit_cost: DEFAULT_RATES.ink_per_kg,
      total_cost: Number((inkKg * DEFAULT_RATES.ink_per_kg).toFixed(0)),
      source: parsed.colors_mentioned ? 'parsed' : 'inferred',
    });
  }

  // ── 3. Press Time ────────────────────────────────────────
  {
    const pressHours = elapsedMinutes
      ? Number((elapsedMinutes / 60).toFixed(2))
      : pliegos > 0
        ? Number(Math.max(pliegos / SHEETS_PER_HOUR, 0.5).toFixed(2))
        : 1;

    if (isDigital) {
      lines.push({
        category: 'impresion',
        description: 'Impresión Digital',
        quantity: pliegos || 1,
        unit: 'click',
        unit_cost: DEFAULT_RATES.digital_per_click,
        total_cost: Number(((pliegos || 1) * DEFAULT_RATES.digital_per_click).toFixed(0)),
        source: parsed.machine_mentioned ? 'parsed' : 'inferred',
      });
    } else {
      lines.push({
        category: 'impresion',
        description: `Tiempo de Prensa (${machineType.replace(/_/g, ' ')})`,
        quantity: pressHours,
        unit: 'hrs',
        unit_cost: DEFAULT_RATES.offset_per_hour,
        total_cost: Number((pressHours * DEFAULT_RATES.offset_per_hour).toFixed(0)),
        source: elapsedMinutes ? 'parsed' : 'inferred',
      });
    }
  }

  // ── 4. Finishing Costs ───────────────────────────────────
  let finishingHours = 0;
  const processes = parsed.processes_mentioned;

  const finishingProcesses = processes.filter(p =>
    ['doblado', 'corchetes', 'pegado', 'empaque', 'encuadernado', 'alzado', 'compaginado'].includes(p)
  );

  for (const proc of finishingProcesses) {
    const qty = pliegos || 1000;
    const hours = Number(Math.max((qty / 3000) * FINISH_HOURS_PER_1000, 0.5).toFixed(2));
    finishingHours += hours;

    lines.push({
      category: 'terminaciones',
      description: proc.charAt(0).toUpperCase() + proc.slice(1),
      quantity: hours,
      unit: 'hrs',
      unit_cost: DEFAULT_RATES.finishing_per_hour,
      total_cost: Number((hours * DEFAULT_RATES.finishing_per_hour).toFixed(0)),
      source: 'parsed',
    });
  }

  // Cutting processes
  const cuttingProcesses = processes.filter(p =>
    ['corte', 'guillotina', 'troquelado'].includes(p)
  );

  for (const proc of cuttingProcesses) {
    const qty = pliegos || 1000;
    const hours = Number(Math.max((qty / 5000) * FINISH_HOURS_PER_1000, 0.5).toFixed(2));
    finishingHours += hours;

    lines.push({
      category: 'guillotina',
      description: proc === 'troquelado' ? 'Troquelado' : 'Corte (Guillotina)',
      quantity: hours,
      unit: 'hrs',
      unit_cost: DEFAULT_RATES.guillotine_per_hour,
      total_cost: Number((hours * DEFAULT_RATES.guillotine_per_hour).toFixed(0)),
      source: 'parsed',
    });
  }

  // ── 5. Labour Cost ───────────────────────────────────────
  {
    // Press operator
    const pressLine = lines.find(l => l.category === 'impresion' && l.unit === 'hrs');
    if (pressLine) {
      lines.push({
        category: 'mano_de_obra',
        description: 'Operador de Prensa',
        quantity: pressLine.quantity,
        unit: 'hrs',
        unit_cost: DEFAULT_RATES.operator_press_per_hour,
        total_cost: Number((pressLine.quantity * DEFAULT_RATES.operator_press_per_hour).toFixed(0)),
        source: 'inferred',
      });
    }

    // Finishing operator
    if (finishingHours > 0) {
      lines.push({
        category: 'mano_de_obra',
        description: 'Operador de Terminaciones',
        quantity: Number(finishingHours.toFixed(2)),
        unit: 'hrs',
        unit_cost: DEFAULT_RATES.operator_finishing_per_hour,
        total_cost: Number((finishingHours * DEFAULT_RATES.operator_finishing_per_hour).toFixed(0)),
        source: 'inferred',
      });
    }
  }

  // ── 6. Energy Cost ───────────────────────────────────────
  {
    const machineHours = lines
      .filter(l => (l.category === 'impresion' || l.category === 'guillotina') && l.unit === 'hrs')
      .reduce((sum, l) => sum + l.quantity, 0);

    if (machineHours > 0) {
      lines.push({
        category: 'energia',
        description: 'Energía eléctrica',
        quantity: Number(machineHours.toFixed(2)),
        unit: 'hrs',
        unit_cost: DEFAULT_RATES.energy_per_hour,
        total_cost: Number((machineHours * DEFAULT_RATES.energy_per_hour).toFixed(0)),
        source: 'inferred',
      });
    }
  }

  // ── Totals ───────────────────────────────────────────────
  const paper_cost = lines.filter(l => l.category === 'papel').reduce((s, l) => s + l.total_cost, 0);
  const ink_cost = lines.filter(l => l.category === 'tinta').reduce((s, l) => s + l.total_cost, 0);
  const press_time_cost = lines.filter(l => l.category === 'impresion').reduce((s, l) => s + l.total_cost, 0);
  const finishing_cost = lines.filter(l => ['terminaciones', 'guillotina'].includes(l.category)).reduce((s, l) => s + l.total_cost, 0);
  const labour_cost = lines.filter(l => l.category === 'mano_de_obra').reduce((s, l) => s + l.total_cost, 0);
  const energy_cost = lines.filter(l => l.category === 'energia').reduce((s, l) => s + l.total_cost, 0);
  const total = lines.reduce((s, l) => s + l.total_cost, 0);

  return {
    paper_cost,
    ink_cost,
    press_time_cost,
    finishing_cost,
    labour_cost,
    energy_cost,
    total_inferred_cost: total,
    running_time_hours: elapsedHours,
    cost_lines: lines,
  };
}

/**
 * Format cost as Chilean Peso string.
 */
export function formatCLP(amount: number): string {
  return `$${amount.toLocaleString('es-CL')}`;
}

/**
 * Calculate confidence-weighted adjustment factor.
 * Lower confidence = wider margin of error displayed to supervisor.
 */
export function confidenceMargin(confidence: number): { low: number; high: number } {
  // 100% confidence → ±0%
  // 50% confidence → ±25%
  // 30% confidence → ±40%
  const margin = ((100 - confidence) / 100) * 0.5;
  return {
    low: 1 - margin,
    high: 1 + margin,
  };
}
