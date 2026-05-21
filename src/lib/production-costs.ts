/**
 * @fileoverview Production cost engine
 *
 * Takes a production OT form + cost center rates and produces
 * a full cost breakdown. Each production process (paper, ink,
 * press time, guillotine, finishing, labour) becomes a costed line.
 */

import type { OTProductionForm } from '@/types/ot-production';
import type {
  CostCenterItem,
  ProductionCostLine,
  CostCategory,
} from '@/types/work-category';
import { DEFAULT_COST_CENTER } from '@/types/work-category';
import { pesos } from '@/lib/format';

/* ─── Constants ─────────────────────────────────────────────── */

/** Standard press sheet area in m² (70 × 100 cm) */
const PRESS_SHEET_AREA_M2 = 0.70;

/** Ink consumption per sheet per colour pass (kg) */
const INK_KG_PER_SHEET_PER_COLOR = 0.0008;

/** Sheets per hour on offset press (avg) */
const SHEETS_PER_HOUR = 3000;

/** Waste/spoilage factor */
const WASTE_FACTOR = 1.05;

/** Setup sheets */
const SETUP_SHEETS = 50;

/** Base hours per finishing process per 1000 sheets */
const FINISH_HOURS_PER_1000 = 0.4;

/* ─── Helpers ───────────────────────────────────────────────── */

function findCostItem(
  costCenter: CostCenterItem[],
  category: CostCategory,
  nameHint?: string,
): CostCenterItem | undefined {
  if (nameHint) {
    const found = costCenter.find(
      (c) => c.category === category && c.is_active && c.name.toLowerCase().includes(nameHint.toLowerCase()),
    );
    if (found) return found;
  }
  return costCenter.find((c) => c.category === category && c.is_active);
}

function lineId(): string {
  return crypto.randomUUID();
}

function parseColorConfig(config: string): { front: number; back: number } {
  const parts = config.split('/');
  return {
    front: parseInt(parts[0]) || 0,
    back: parseInt(parts[1]) || 0,
  };
}

/* ─── Main cost computation ─────────────────────────────────── */

export function computeProductionCosts(
  form: OTProductionForm,
  costCenter: CostCenterItem[] = DEFAULT_COST_CENTER,
): ProductionCostLine[] {
  const lines: ProductionCostLine[] = [];
  const item = form.items[0]; // primary item
  if (!item) return lines;

  const colors = parseColorConfig(form.machine.color_config);
  const totalColorPasses = colors.front + colors.back;

  // ── 1. Paper / Substrate ─────────────────────────────────
  {
    // Weight: pliegos_a_maquina × sheet_area × grammage / 1000
    const totalPliegos = form.machine.tiraje > 0
      ? Math.ceil(form.machine.tiraje * WASTE_FACTOR) + SETUP_SHEETS
      : item.pliegos_a_maquina > 0
        ? item.pliegos_a_maquina
        : Math.ceil(form.cantidad_total / 4) + SETUP_SHEETS;

    const sheetAreaM2 = (item.sheet_width / 100) * (item.sheet_height / 100);
    const paperKg = Number(((totalPliegos * sheetAreaM2 * item.grammage_grs) / 1000).toFixed(2));

    // Try to match paper in cost center by name
    const paperName = `${typeof item.papel === 'string' ? item.papel.charAt(0).toUpperCase() + item.papel.slice(1) : 'Bond'} ${item.grammage_grs} grs`;
    const paperCC = findCostItem(costCenter, 'papel', `${item.grammage_grs} grs`)
      || findCostItem(costCenter, 'papel');
    const unitCost = paperCC?.unit_cost ?? 1500;

    lines.push({
      id: lineId(),
      cost_center_id: paperCC?.id,
      category: 'papel',
      description: paperName,
      quantity: paperKg,
      unit: 'kg',
      unit_cost: unitCost,
      total_cost: pesos(paperKg, unitCost),
    });
  }

  // ── 2. Ink ───────────────────────────────────────────────
  {
    const totalSheets = form.machine.tiraje > 0
      ? form.machine.tiraje
      : item.pliegos_a_maquina || form.cantidad_total;

    const inkKg = Number((totalSheets * INK_KG_PER_SHEET_PER_COLOR * totalColorPasses).toFixed(3));
    const inkCC = findCostItem(costCenter, 'tinta', 'CMYK') || findCostItem(costCenter, 'tinta');
    const unitCost = inkCC?.unit_cost ?? 31915;

    if (inkKg > 0) {
      lines.push({
        id: lineId(),
        cost_center_id: inkCC?.id,
        category: 'tinta',
        description: `Tinta ${totalColorPasses > 4 ? 'CMYK + Especiales' : 'CMYK'}`,
        quantity: inkKg,
        unit: 'kg',
        unit_cost: unitCost,
        total_cost: pesos(inkKg, unitCost),
      });
    }
  }

  // ── 3. CTP Plates ────────────────────────────────────────
  if (form.machine.ctp_needed) {
    const plateCount = form.machine.ctp_count || totalColorPasses || 4;
    const plateCC = findCostItem(costCenter, 'planchas');
    const unitCost = plateCC?.unit_cost ?? 8500;

    lines.push({
      id: lineId(),
      cost_center_id: plateCC?.id,
      category: 'planchas',
      description: `Planchas CTP (${plateCount} planchas)`,
      quantity: plateCount,
      unit: 'und',
      unit_cost: unitCost,
      total_cost: plateCount * unitCost,
    });
  }

  // ── 4. Press Time (Impresión) ────────────────────────────
  {
    const totalSheets = form.machine.tiraje || item.pliegos_a_maquina || form.cantidad_total;
    const printHours = form.machine.horas
      || Number((totalSheets / SHEETS_PER_HOUR).toFixed(2))
      || 1;

    // Match machine type
    const machineHintMap: Record<string, string> = {
      offset_1_color: 'Offset 1',
      offset_2_colores: 'Offset 2',
      offset_4_colores: 'Offset 4',
      impresion_digital: 'Digital',
      serigrafia: 'Serigraf',
      flexografia: 'Flexo',
    };
    const hint = machineHintMap[form.machine.machine_type] || '';
    const pressCC = findCostItem(costCenter, 'impresion', hint) || findCostItem(costCenter, 'impresion');
    const unitCost = pressCC?.unit_cost ?? 55000;

    // For digital, cost is per click not per hour
    if (form.machine.machine_type === 'impresion_digital') {
      const digCC = findCostItem(costCenter, 'impresion', 'Digital');
      const clickCost = digCC?.unit_cost ?? 595;
      lines.push({
        id: lineId(),
        cost_center_id: digCC?.id,
        category: 'impresion',
        description: 'Impresión Digital',
        quantity: totalSheets,
        unit: 'click',
        unit_cost: clickCost,
        total_cost: pesos(totalSheets, clickCost),
      });
    } else {
      lines.push({
        id: lineId(),
        cost_center_id: pressCC?.id,
        category: 'impresion',
        description: `Tiempo de Prensa (${pressCC?.name || form.machine.machine_type})`,
        quantity: Number(printHours.toFixed(2)),
        unit: 'hrs',
        unit_cost: unitCost,
        total_cost: pesos(printHours, unitCost),
      });
    }
  }

  // ── 5. Guillotine / Cutting ──────────────────────────────
  {
    const totalSheets = form.machine.tiraje || item.pliegos_a_maquina || form.cantidad_total;

    if (form.finishing.corte_resma) {
      const hours = Number(Math.max((totalSheets / 5000) * FINISH_HOURS_PER_1000, 0.5).toFixed(2));
      const cc = findCostItem(costCenter, 'guillotina', 'Resma') || findCostItem(costCenter, 'guillotina');
      const unitCost = cc?.unit_cost ?? 18000;
      lines.push({
        id: lineId(),
        cost_center_id: cc?.id,
        category: 'guillotina',
        description: 'Corte Resma (Guillotina)',
        quantity: hours,
        unit: 'hrs',
        unit_cost: unitCost,
        total_cost: pesos(hours, unitCost),
      });
    }

    if (form.finishing.corte_final) {
      const hours = Number(Math.max((totalSheets / 5000) * FINISH_HOURS_PER_1000, 0.5).toFixed(2));
      const cc = findCostItem(costCenter, 'guillotina', 'Final') || findCostItem(costCenter, 'guillotina');
      const unitCost = cc?.unit_cost ?? 18000;
      lines.push({
        id: lineId(),
        cost_center_id: cc?.id,
        category: 'guillotina',
        description: 'Corte Final (Guillotina)',
        quantity: hours,
        unit: 'hrs',
        unit_cost: unitCost,
        total_cost: pesos(hours, unitCost),
      });
    }
  }

  // ── 6. Finishing / Terminaciones ─────────────────────────
  {
    const totalSheets = form.machine.tiraje || item.pliegos_a_maquina || form.cantidad_total;
    const baseHours = (qty?: number) =>
      Number(Math.max(((qty || totalSheets) / 3000) * FINISH_HOURS_PER_1000, 0.5).toFixed(2));

    const finishingProcesses: Array<{
      active: boolean;
      qty?: number;
      name: string;
      hint: string;
    }> = [
      { active: form.finishing.doblados, qty: form.finishing.doblados_qty, name: 'Doblado', hint: 'Doblado' },
      { active: form.finishing.corchetes, qty: form.finishing.corchetes_qty, name: 'Corcheteado', hint: 'Corcheteado' },
      { active: form.finishing.cajas, qty: form.finishing.cajas_qty, name: 'Empaque en Cajas', hint: 'Cajas' },
    ];

    for (const proc of finishingProcesses) {
      if (proc.active) {
        const hours = baseHours(proc.qty);
        const cc = findCostItem(costCenter, 'terminaciones', proc.hint) || findCostItem(costCenter, 'terminaciones');
        const unitCost = cc?.unit_cost ?? 12000;
        lines.push({
          id: lineId(),
          cost_center_id: cc?.id,
          category: 'terminaciones',
          description: proc.name,
          quantity: hours,
          unit: 'hrs',
          unit_cost: unitCost,
          total_cost: pesos(hours, unitCost),
        });
      }
    }

    // Despacho Gonsa → Tercerizado
    if (form.finishing.despacho_gonsa) {
      const cc = findCostItem(costCenter, 'tercerizado');
      lines.push({
        id: lineId(),
        cost_center_id: cc?.id,
        category: 'tercerizado',
        description: `Despacho ${form.finishing.despacho_gonsa_detail || 'externo'}`,
        quantity: 1,
        unit: 'und',
        unit_cost: cc?.unit_cost ?? 0,
        total_cost: cc?.unit_cost ?? 0,
      });
    }

    // Otros (free text finishing)
    if (form.finishing.otros) {
      const cc = findCostItem(costCenter, 'terminaciones');
      lines.push({
        id: lineId(),
        cost_center_id: cc?.id,
        category: 'terminaciones',
        description: form.finishing.otros,
        quantity: 1,
        unit: 'hrs',
        unit_cost: cc?.unit_cost ?? 12000,
        total_cost: cc?.unit_cost ?? 12000,
      });
    }
  }

  // ── 7. Workshop Labour ───────────────────────────────────
  {
    // Estimate total production hours from all processes
    const totalProductionHours = lines
      .filter((l) => l.unit === 'hrs')
      .reduce((sum, l) => sum + l.quantity, 0);

    // Operator for press
    const pressHours = lines.find((l) => l.category === 'impresion' && l.unit === 'hrs')?.quantity ?? 0;
    if (pressHours > 0) {
      const cc = findCostItem(costCenter, 'mano_de_obra', 'Operador de Prensa');
      const unitCost = cc?.unit_cost ?? 8500;
      lines.push({
        id: lineId(),
        cost_center_id: cc?.id,
        category: 'mano_de_obra',
        description: 'Operador de Prensa',
        quantity: Number(pressHours.toFixed(2)),
        unit: 'hrs',
        unit_cost: unitCost,
        total_cost: pesos(pressHours, unitCost),
      });
    }

    // Guillotine operator
    const guillotineHours = lines
      .filter((l) => l.category === 'guillotina')
      .reduce((sum, l) => sum + l.quantity, 0);
    if (guillotineHours > 0) {
      const cc = findCostItem(costCenter, 'mano_de_obra', 'Guillotina');
      const unitCost = cc?.unit_cost ?? 7000;
      lines.push({
        id: lineId(),
        cost_center_id: cc?.id,
        category: 'mano_de_obra',
        description: 'Operador de Guillotina',
        quantity: Number(guillotineHours.toFixed(2)),
        unit: 'hrs',
        unit_cost: unitCost,
        total_cost: pesos(guillotineHours, unitCost),
      });
    }

    // Finishing operators
    const finishHours = lines
      .filter((l) => l.category === 'terminaciones' && l.unit === 'hrs')
      .reduce((sum, l) => sum + l.quantity, 0);
    if (finishHours > 0) {
      const cc = findCostItem(costCenter, 'mano_de_obra', 'Terminaciones');
      const unitCost = cc?.unit_cost ?? 6500;
      lines.push({
        id: lineId(),
        cost_center_id: cc?.id,
        category: 'mano_de_obra',
        description: 'Operador de Terminaciones',
        quantity: Number(finishHours.toFixed(2)),
        unit: 'hrs',
        unit_cost: unitCost,
        total_cost: pesos(finishHours, unitCost),
      });
    }
  }

  // ── 8. Energy ────────────────────────────────────────────
  {
    const machineHours = lines
      .filter((l) => (l.category === 'impresion' || l.category === 'guillotina') && l.unit === 'hrs')
      .reduce((sum, l) => sum + l.quantity, 0);

    if (machineHours > 0) {
      const cc = findCostItem(costCenter, 'energia');
      const unitCost = cc?.unit_cost ?? 3500;
      lines.push({
        id: lineId(),
        cost_center_id: cc?.id,
        category: 'energia',
        description: 'Energía eléctrica (hora-máquina)',
        quantity: Number(machineHours.toFixed(2)),
        unit: 'hrs',
        unit_cost: unitCost,
        total_cost: pesos(machineHours, unitCost),
      });
    }
  }

  // ── 9. Overhead ──────────────────────────────────────────
  {
    const subtotal = lines.reduce((sum, l) => sum + l.total_cost, 0);
    const cc = findCostItem(costCenter, 'overhead');
    const overheadPct = cc?.unit_cost ?? 8; // default 8%
    const overheadAmount = Math.round(subtotal * overheadPct / 100);

    if (overheadAmount > 0) {
      lines.push({
        id: lineId(),
        cost_center_id: cc?.id,
        category: 'overhead',
        description: `Gastos generales (${overheadPct}%)`,
        quantity: 1,
        unit: '%',
        unit_cost: overheadAmount,
        total_cost: overheadAmount,
      });
    }
  }

  return lines;
}

/* ─── Summary by category ───────────────────────────────────── */

export interface CostSummary {
  category: CostCategory;
  label: string;
  total: number;
  lines: ProductionCostLine[];
}

export function summarizeCosts(lines: ProductionCostLine[]): {
  categories: CostSummary[];
  grandTotal: number;
  unitCost: number;
} {
  const categoryMap = new Map<CostCategory, ProductionCostLine[]>();

  for (const line of lines) {
    const existing = categoryMap.get(line.category) ?? [];
    existing.push(line);
    categoryMap.set(line.category, existing);
  }

  const labelMap: Record<CostCategory, string> = {
    papel: 'Papel / Sustrato',
    tinta: 'Tinta',
    planchas: 'Planchas CTP',
    impresion: 'Impresión (Máquina)',
    guillotina: 'Guillotina / Corte',
    terminaciones: 'Terminaciones',
    mano_de_obra: 'Mano de Obra',
    tercerizado: 'Tercerizado',
    energia: 'Energía',
    overhead: 'Overhead',
  };

  const categories: CostSummary[] = [];
  for (const [cat, catLines] of categoryMap) {
    categories.push({
      category: cat,
      label: labelMap[cat] || cat,
      total: catLines.reduce((s, l) => s + l.total_cost, 0),
      lines: catLines,
    });
  }

  // Sort by a natural order
  const order: CostCategory[] = [
    'papel', 'tinta', 'planchas', 'impresion', 'guillotina',
    'terminaciones', 'mano_de_obra', 'tercerizado', 'energia', 'overhead',
  ];
  categories.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));

  const grandTotal = lines.reduce((s, l) => s + l.total_cost, 0);

  return { categories, grandTotal, unitCost: 0 };
}
