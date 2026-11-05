/**
 * «Editar e Integrar»: el supervisor corrige la interpretación del mensaje
 * —lo que el parser extrajo y los costos que se infirieron de eso— y la
 * aprobación integra la versión corregida.
 *
 * ── Qué arrastra cada dato ──────────────────────────────────────────────────
 *
 * - Pliegos y merma → papel y tinta. Son plata que sólo existe por este parte:
 *   si el supervisor corrige 500 a 800 pliegos, los kilos de papel tienen que
 *   seguirlo, o se integra un costo que contradice el dato que él mismo dejó.
 *   Se escala la línea original (que ya trae el gramaje y el formato de la OT)
 *   en vez de volver a inferirla sin ese contexto.
 *
 * - Horas → la pasada de la etapa (`ot_stage_reports`), vía `corrected_data`.
 *   NO se copian a las líneas en `hrs`: las horas de la pasada se valorizan
 *   aparte con la tarifa de la máquina (ver 20260827120000), y cargarlas también
 *   como plata en `ot_real_costs` contaría el mismo tiempo dos veces. Esas
 *   líneas quedan editables a mano para quien sepa que corresponde.
 *
 * Una línea que el supervisor tocó a mano es suya: un cambio posterior de
 * pliegos no la pisa.
 */

import type { InferredCostLine } from '@/types/whatsapp-production';

/** Las categorías que una línea de costo de un parte puede tener. Una sola lista: la usa el editor y la valida el servidor. */
export const COST_CATEGORIES = [
	'papel', 'tinta', 'impresion', 'guillotina', 'terminaciones', 'mano_de_obra', 'energia', 'materiales', 'otros',
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

const asCategory = (c: string): CostCategory =>
	(COST_CATEGORIES as readonly string[]).includes(c) ? (c as CostCategory) : 'otros';

export interface EditableData {
	pliegos_produced: number | null;
	merma: number | null;
	buenos: number | null;
	hours_reported: number | null;
	ajuste_minutes: number | null;
	processes_mentioned: string[];
	problems_reported: string[];
}

export interface DraftLine extends InferredCostLine {
	/** Identidad local, estable aunque se agreguen o quiten líneas. */
	_key: string;
	/** El supervisor la editó o la agregó: los datos ya no la recalculan. */
	_manual: boolean;
}

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function toEditableData(parsed: Record<string, unknown> | null | undefined): EditableData {
	const p = parsed ?? {};
	const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
	return {
		pliegos_produced: n(p.pliegos_produced),
		merma: n(p.merma),
		buenos: n(p.buenos),
		hours_reported: n(p.hours_reported),
		ajuste_minutes: n(p.ajuste_minutes),
		processes_mentioned: list(p.processes_mentioned),
		problems_reported: list(p.problems_reported),
	};
}

/** Pliegos de tiraje, con el mismo orden de preferencia que la inferencia. */
const tiraje = (d: EditableData) =>
	d.pliegos_produced ?? (d.buenos != null && d.merma != null ? d.buenos + d.merma : d.buenos) ?? 0;
const totalSheets = (d: EditableData) => tiraje(d) + (d.merma ?? 0);

const round2 = (x: number) => Math.round(x * 100) / 100;

function scaled(line: InferredCostLine, ratio: number, label: string, from: RegExp): InferredCostLine {
	const quantity = round2(line.quantity * ratio);
	return {
		...line,
		quantity,
		total_cost: Math.round(quantity * line.unit_cost),
		description: line.description.replace(from, label),
	};
}

/** La línea original, ajustada a los datos corregidos. */
export function deriveLine(base: InferredCostLine, baseData: EditableData, data: EditableData): InferredCostLine {
	if (base.category === 'papel') {
		const before = totalSheets(baseData);
		const after = totalSheets(data);
		if (before > 0 && after !== before) {
			return scaled(base, after / before, `(${after} pliegos)`, /\(\s*\d[\d.,]*\s*pliegos\s*\)/i);
		}
	}
	if (base.category === 'tinta') {
		const before = tiraje(baseData);
		const after = tiraje(data);
		if (before > 0 && after !== before) {
			return scaled(base, after / before, `× ${after} pliegos`, /×\s*\d[\d.,]*\s*pliegos/i);
		}
	}
	return base;
}

let seq = 0;
export function toDraftLines(lines: InferredCostLine[]): DraftLine[] {
	return lines.map((l) => ({ ...l, _key: `l${++seq}`, _manual: false }));
}

export function newDraftLine(): DraftLine {
	return {
		category: 'otros', description: '', quantity: 1, unit: 'un', unit_cost: 0, total_cost: 0,
		source: 'default', _key: `l${++seq}`, _manual: true,
	};
}

/**
 * Recalcular las líneas que no tocó nadie cuando cambian los datos. `base` son
 * las líneas al abrir la edición (mismas `_key`), `baseData` los datos de ese
 * momento.
 */
export function rederive(
	current: DraftLine[],
	base: DraftLine[],
	baseData: EditableData,
	data: EditableData,
): DraftLine[] {
	const byKey = new Map(base.map((l) => [l._key, l]));
	return current.map((l) => {
		const orig = l._manual ? undefined : byKey.get(l._key);
		return orig ? { ...orig, ...deriveLine(orig, baseData, data), _key: l._key, _manual: false } : l;
	});
}

/**
 * Lo que viaja al servidor (`CorrectionsSchema`, src/lib/golden-thread.ts):
 * sólo los datos editables y las líneas, sin totales. El servidor fusiona los
 * datos con el parse original y recalcula cada total — y en la base
 * `ot_real_costs.total_cost` es una columna generada.
 */
export function toCorrections(data: EditableData, lines: DraftLine[]) {
	const entero = (v: number | null) => (v == null ? null : Math.round(v));
	return {
		data: {
			pliegos_produced: entero(data.pliegos_produced),
			merma: entero(data.merma),
			buenos: entero(data.buenos),
			hours_reported: data.hours_reported,
			ajuste_minutes: data.ajuste_minutes,
			processes_mentioned: data.processes_mentioned,
			problems_reported: data.problems_reported.map((s) => s.trim()).filter(Boolean),
		},
		costLines: lines
			.filter((l) => l.description.trim() !== '' || l.total_cost > 0)
			.map((l) => ({
				category: asCategory(l.category),
				description: l.description.trim() || l.category,
				quantity: l.quantity,
				unit: l.unit.trim() || 'un',
				unit_cost: l.unit_cost,
				source: l.source,
			})),
	};
}
