/**
 * Presupuesto contra real de una OT, por categoría del libro.
 *
 * Lo presupuestado son las operaciones de la OT (`ot_operations`, lo que vino
 * de la cotización). Lo real es el libro (`ot_cost_lines`, kind `actual`): el
 * papel que salió del lote, las pasadas, la mano de obra de Planta y las
 * correcciones. Hasta 2026-11-27 el análisis leía `ot_real_costs` y emparejaba
 * por descripción: lo real de hoy no aparecía nunca (B7 de plan.md).
 *
 * Se compara por CATEGORÍA, no por texto: «Couché 300 g» en la cotización y
 * «Salida de papel, lote L-12» en el libro son el mismo rubro con nombres
 * distintos, y emparejar por texto los mostraba como dos cosas.
 */

import { ledgerCategory, CORRECTION_REF, type LedgerCategory } from '@/lib/cost-correction';

export const LEDGER_CATEGORY_LABEL: Record<LedgerCategory, string> = {
	material: 'Papel y materiales',
	machine: 'Máquina',
	labor: 'Mano de obra',
	finishing: 'Terminaciones',
	outsourced: 'Tercerizados',
	overhead: 'Gastos generales',
	other: 'Otros',
};

/** De dónde salió cada línea real, en palabras del taller. */
const ORIGEN: Record<string, string> = {
	inventory_tx: 'salida de bodega',
	stage_pass: 'pasada cerrada',
	[CORRECTION_REF]: 'corrección',
	maqueta: 'maqueta',
	ot_real_cost: 'carga anterior',
};

const ORDER: LedgerCategory[] = ['material', 'machine', 'labor', 'finishing', 'outsourced', 'overhead', 'other'];

export interface BudgetOperation {
	category: string | null;
	quantity: number | null;
	unit: string | null;
	unit_cost: number | null;
	total_cost: number | null;
}

export interface LedgerLine {
	category: string;
	quantity: number | null;
	unit: string | null;
	total: number | null;
	source: string | null;
	ref_type: string | null;
}

export interface CostAnalysisItem {
	code: string;
	description: string;
	category: LedgerCategory;
	estimated_qty: number;
	estimated_unit: string;
	estimated_unit_cost: number;
	estimated_cost: number;
	actual_qty: number | null;
	actual_unit: string;
	actual_unit_cost: number | null;
	actual_cost: number;
	deviation_pct: number | null;
	has_actual: boolean;
	/** De dónde salió lo real: consumo, pasada, corrección… */
	workflow_steps: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function analyzeCosts(operations: BudgetOperation[], actual: LedgerLine[]) {
	const est = new Map<LedgerCategory, { qty: number; unit: string; cost: number }>();
	for (const op of operations) {
		const c = ledgerCategory(op.category ?? 'otros');
		const e = est.get(c) ?? { qty: 0, unit: op.unit ?? 'unit', cost: 0 };
		e.qty += Number(op.quantity ?? 0);
		e.cost += Number(op.total_cost ?? Number(op.quantity ?? 0) * Number(op.unit_cost ?? 0));
		est.set(c, e);
	}

	const real = new Map<LedgerCategory, { qty: number; unit: string; cost: number; sources: Set<string> }>();
	let correcciones = 0;
	for (const l of actual) {
		const c = ledgerCategory(l.category);
		const r = real.get(c) ?? { qty: 0, unit: l.unit ?? 'unit', cost: 0, sources: new Set<string>() };
		r.qty += Number(l.quantity ?? 0);
		r.cost += Number(l.total ?? 0);
		const origen = ORIGEN[l.ref_type ?? ''] ?? 'otro registro';
		r.sources.add(origen);
		if (l.ref_type === CORRECTION_REF) correcciones += Number(l.total ?? 0);
		real.set(c, r);
	}

	const items: CostAnalysisItem[] = ORDER.filter((c) => est.has(c) || real.has(c)).map((c, i) => {
		const e = est.get(c);
		const r = real.get(c);
		const estCost = round2(e?.cost ?? 0);
		const actCost = round2(r?.cost ?? 0);
		return {
			code: String(i + 1).padStart(5, '0'),
			description: LEDGER_CATEGORY_LABEL[c],
			category: c,
			estimated_qty: e?.qty ?? 0,
			estimated_unit: e?.unit ?? r?.unit ?? 'unit',
			estimated_unit_cost: e && e.qty > 0 ? round2(e.cost / e.qty) : 0,
			estimated_cost: estCost,
			actual_qty: r ? r.qty : null,
			actual_unit: r?.unit ?? e?.unit ?? 'unit',
			actual_unit_cost: r && r.qty > 0 ? round2(r.cost / r.qty) : null,
			actual_cost: actCost,
			// Sin real todavía no hay desvío: «pendiente», no −100 %.
			deviation_pct: r && estCost > 0 ? round2(((actCost - estCost) / estCost) * 100) : null,
			has_actual: Boolean(r),
			workflow_steps: r ? [...r.sources] : [],
		};
	});

	const totalEstimated = items.reduce((s, l) => s + l.estimated_cost, 0);
	const totalActual = items.reduce((s, l) => s + l.actual_cost, 0);
	const anyActuals = items.some((l) => l.has_actual);
	return {
		summary: {
			total_estimated: round2(totalEstimated),
			total_actual: round2(totalActual),
			overall_deviation_pct: anyActuals && totalEstimated > 0 ? round2(((totalActual - totalEstimated) / totalEstimated) * 100) : null,
			line_item_count: items.length,
			items_with_actuals: items.filter((l) => l.has_actual).length,
			items_over_budget: items.filter((l) => (l.deviation_pct ?? 0) > 0).length,
			items_under_budget: items.filter((l) => l.deviation_pct !== null && l.deviation_pct < 0).length,
			corrections_total: round2(correcciones),
		},
		line_items: items,
		workflow_steps_reported: [...new Set(items.flatMap((i) => i.workflow_steps))],
	};
}
