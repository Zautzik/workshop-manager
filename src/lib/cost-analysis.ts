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
 *
 * El dinero se suma por rubro; las cantidades, sólo dentro de una misma
 * unidad. Un rubro puede mezclar unidades (papel en pliegos y tinta en kg):
 * entonces no hay cantidad total ni costo unitario, sólo el detalle por unidad.
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
	capture: 'parte de WhatsApp',
};

const ORDER: LedgerCategory[] = ['material', 'machine', 'labor', 'finishing', 'outsourced', 'overhead', 'other'];

/** Rótulo de la unidad cuando un rubro mezcla varias. */
export const MIXED_UNITS = 'varias unidades';

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

export interface UnitQty {
	unit: string;
	qty: number;
}

export interface CostAnalysisItem {
	code: string;
	description: string;
	category: LedgerCategory;
	/** 0 si no hay presupuesto o si mezcla unidades (ver `estimated_quantities`). */
	estimated_qty: number;
	estimated_unit: string;
	estimated_unit_cost: number;
	estimated_cost: number;
	/** null si no hay real o si mezcla unidades (ver `actual_quantities`). */
	actual_qty: number | null;
	actual_unit: string;
	actual_unit_cost: number | null;
	actual_cost: number;
	/** Cantidades por unidad, nunca sumadas entre unidades distintas. */
	estimated_quantities: UnitQty[];
	actual_quantities: UnitQty[];
	deviation_pct: number | null;
	has_actual: boolean;
	/** De dónde salió lo real: consumo, pasada, corrección… */
	workflow_steps: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

type Bucket = { qtys: Map<string, number>; cost: number };

function addQty(m: Map<string, number>, unit: string | null, qty: number | null) {
	const u = (unit ?? '').trim() || 'unit';
	m.set(u, (m.get(u) ?? 0) + Number(qty ?? 0));
}

/** Las unidades que quedan con cantidad (una corrección anulada se cancela a cero). */
const asList = (m: Map<string, number>): UnitQty[] =>
	[...m].filter(([, q]) => round2(q) !== 0).map(([unit, qty]) => ({ unit, qty: round2(qty) }));

/** Cantidad única sólo si hay una sola unidad. */
function single(b: Bucket | undefined): UnitQty | null {
	if (!b) return null;
	const list = asList(b.qtys);
	return list.length === 1 ? list[0] : null;
}

function unitLabel(b: Bucket | undefined): string | null {
	if (!b) return null;
	const list = asList(b.qtys);
	if (list.length === 1) return list[0].unit;
	if (list.length === 0) return [...b.qtys.keys()][0] ?? null;
	return MIXED_UNITS;
}

export function analyzeCosts(operations: BudgetOperation[], actual: LedgerLine[]) {
	const est = new Map<LedgerCategory, Bucket>();
	for (const op of operations) {
		const c = ledgerCategory(op.category ?? 'otros');
		const e = est.get(c) ?? { qtys: new Map<string, number>(), cost: 0 };
		addQty(e.qtys, op.unit, op.quantity);
		e.cost += Number(op.total_cost ?? Number(op.quantity ?? 0) * Number(op.unit_cost ?? 0));
		est.set(c, e);
	}

	const real = new Map<LedgerCategory, Bucket & { sources: Set<string> }>();
	let correcciones = 0;
	for (const l of actual) {
		const c = ledgerCategory(l.category);
		const r = real.get(c) ?? { qtys: new Map<string, number>(), cost: 0, sources: new Set<string>() };
		addQty(r.qtys, l.unit, l.quantity);
		r.cost += Number(l.total ?? 0);
		r.sources.add(ORIGEN[l.ref_type ?? ''] ?? 'otro registro');
		if (l.ref_type === CORRECTION_REF) correcciones += Number(l.total ?? 0);
		real.set(c, r);
	}

	const items: CostAnalysisItem[] = ORDER.filter((c) => est.has(c) || real.has(c)).map((c, i) => {
		const e = est.get(c);
		const r = real.get(c);
		const estCost = round2(e?.cost ?? 0);
		const actCost = round2(r?.cost ?? 0);
		const eq = single(e);
		const rq = single(r);
		return {
			code: String(i + 1).padStart(5, '0'),
			description: LEDGER_CATEGORY_LABEL[c],
			category: c,
			estimated_qty: eq?.qty ?? 0,
			estimated_unit: unitLabel(e) ?? unitLabel(r) ?? 'unit',
			estimated_unit_cost: eq && eq.qty > 0 ? round2(estCost / eq.qty) : 0,
			estimated_cost: estCost,
			actual_qty: rq ? rq.qty : null,
			actual_unit: unitLabel(r) ?? unitLabel(e) ?? 'unit',
			actual_unit_cost: rq && rq.qty > 0 ? round2(actCost / rq.qty) : null,
			actual_cost: actCost,
			estimated_quantities: e ? asList(e.qtys) : [],
			actual_quantities: r ? asList(r.qtys) : [],
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
