/**
 * @fileoverview WhatsApp Cost Inference Engine
 *
 * Takes parsed WhatsApp production data + OT context. A report no longer
 * carries cost by itself: it carries QUANTITIES (sheets, waste, hours) that
 * feed the stage pass and the consumption, which are the only writers.
 *
 * ── Lo que esto ya no infiere ─────────────────────────────────────────────
 *
 * Tiempo (auditoría 2026-11-05, C-1/C-2). Prensa, guillotina, terminaciones,
 * operario y energía tienen su único dueño:
 *   - máquina: las horas de la pasada × la tarifa cotizada (stage-valuation.ts);
 *   - operario: los turnos (labor-attribution.ts).
 *
 * Material (auditoría 2026-11-09). Papel y tinta se inferían de los pliegos a
 * un precio de catálogo, al lado del mismo papel ya cargado por la recepción
 * de la OC y por el diálogo del tablero: OT 41221 llegó a $5,4 M de material
 * contra $960.000 comprados. Regla del dueño: el material cuesta cuando SE
 * CONSUME, al precio real del lote usado (salida de papel, escaneo o captura de
 * bodega → consumir_lote → trg_cost_ot_material_movement). Un parte aporta
 * cantidades —pliegos, merma, horas—, nunca pesos de material.
 *
 * Clics de digital (2026-11-10): también salieron. Son consumo de máquina, y
 * la máquina se registra al cerrar la pasada (stage-valuation.ts), con los
 * pliegos y la merma que el parte ya le pasa a esa pasada.
 *
 * Queda la forma (`InferredCostData`) porque la revisión y los partes viejos
 * la leen: siempre en cero, con el tiempo de corrida como referencia.
 */

import type { ParsedProductionData, InferredCostData, InferredCostLine } from '@/types/whatsapp-production';
import { formatCLP } from '@/lib/format';
import type { CostOverrides } from '@/lib/ot-calculations';

/* ─── Constants ──────────────────────────────────────────────── */

const SHEETS_PER_HOUR = 3000;

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

/* ─── Main Inference Engine ──────────────────────────────────── */

/**
 * The (empty) cost of a production report, plus its running time.
 *
 * @param parsed - Parsed production data from operator message
 * @param elapsedMinutes - Time between START and END messages
 * @param otContext - Optional OT context for better accuracy
 * @param _rates - Se conserva la firma: el ingest todavía las resuelve.
 */
export function inferProductionCosts(
  parsed: ParsedProductionData,
  elapsedMinutes: number | null,
  otContext?: OTContext | null,
  _rates: CostOverrides = {},
): InferredCostData {
  const lines: InferredCostLine[] = [];

  // If only 'buenos' is available, reconstruct total sheets: buenos + merma
  const pliegos = parsed.pliegos_produced
    ?? (parsed.buenos && parsed.merma ? parsed.buenos + parsed.merma : null)
    ?? parsed.buenos
    ?? otContext?.tiraje
    ?? otContext?.quantity
    ?? 0;

  const elapsedHours = elapsedMinutes
    ? Number((elapsedMinutes / 60).toFixed(2))
    : pliegos > 0
      ? Number((pliegos / SHEETS_PER_HOUR).toFixed(2))
      : 1;

  return {
    paper_cost: 0,
    ink_cost: 0,
    press_time_cost: 0,
    finishing_cost: 0,
    labour_cost: 0,
    energy_cost: 0,
    total_inferred_cost: 0,
    running_time_hours: elapsedHours,
    cost_lines: lines,
  };
}

/**
 * Format cost as Chilean Peso string.
 * Re-exported from @/lib/format for consumers that import from this module.
 */
export { formatCLP };

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
