/**
 * «Editar e Integrar»: el supervisor corrige la interpretación del mensaje
 * —lo que el parser extrajo y el costo que se infirió de eso— y la
 * aprobación integra la versión corregida.
 *
 * ── Qué arrastra cada dato ──────────────────────────────────────────────────
 *
 * Ningún dato arrastra plata: un parte lleva cantidades. Las líneas que
 * quedan editables son las que no tienen otro dueño (un tercerizado, una
 * terminación externa) y no dependen de los pliegos ni de las horas.
 *
 * - Pliegos y merma → NO son plata de material. El papel y la tinta cuestan
 *   cuando salen de bodega, al precio real del lote (migración
 *   20261110120000). Corregirlos acá corrige la CANTIDAD del parte —la que
 *   mide la merma y la brecha contra lo cotizado—, no un peso.
 *
 * - Horas, pliegos y merma → la pasada de la etapa (`ot_stage_reports`), vía
 *   `corrected_data`. La pasada cerrada es el consumo de máquina y la única que
 *   lo valoriza: horas × tarifa, o clics en digital (stage-valuation.ts).
 *
 * - Mano de obra → tampoco es una línea del parte. Sale de la misma pasada:
 *   la gente que Planta asignó a la máquina, por las horas que la OT estuvo en
 *   su turno (labor-from-shifts.ts, migración 20261111120000).
 */

import type { InferredCostLine } from '@/types/whatsapp-production';

/** Las categorías que una línea de costo de un parte puede tener. Una sola lista: la usa el editor y la valida el servidor. Sin material, máquina ni mano de obra: ver arriba. */
export const COST_CATEGORIES = ['terminaciones', 'energia', 'otros'] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

/** Material, máquina y mano de obra: entran por el consumo y la pasada, nunca por un parte. Partes viejos todavía las traen. */
const CONSUMED_CATEGORIES = new Set(['papel', 'tinta', 'materiales', 'impresion', 'guillotina', 'mano_de_obra']);
const isConsumed = (l: { category: string }) => CONSUMED_CATEGORIES.has(l.category);

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

let seq = 0;
/** Las líneas que se pueden editar. El material y la máquina de un parte viejo no se ofrecen: no se integrarían. */
export function toDraftLines(lines: InferredCostLine[]): DraftLine[] {
	return lines.filter((l) => !isConsumed(l)).map((l) => ({ ...l, _key: `l${++seq}`, _manual: false }));
}

export function newDraftLine(): DraftLine {
	return {
		category: 'otros', description: '', quantity: 1, unit: 'un', unit_cost: 0, total_cost: 0,
		source: 'default', _key: `l${++seq}`, _manual: true,
	};
}

/**
 * Lo que viaja al servidor (`CorrectionsSchema`, src/lib/golden-thread.ts):
 * sólo los datos editables y las líneas, sin totales. El servidor fusiona los
 * datos con el parse original y recalcula cada total — y en la base
 * `ot_real_costs.total_cost` es una columna generada.
 *
 * El material y la máquina se descartan ANTES de normalizar la categoría: si
 * no, una línea de papel o de prensa vieja viajaría como «otros» y entraría al
 * costo por la puerta de atrás.
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
			.filter((l) => !isConsumed(l))
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
