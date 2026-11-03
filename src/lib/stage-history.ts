/**
 * Cuánto se equivoca el presupuesto, etapa por etapa, según lo que el taller
 * declaró de verdad.
 *
 * `estimate_ot_hours` (RPC) tiene un "Tier 2 histórico" que promedia
 * `ot_machine_schedule.actual_hours` — una columna que ninguna pantalla
 * escribe, así que ese tier nunca tuvo una sola muestra y toda estimación salía
 * con confianza "low". El dato real existe en otro lado: cada vez que una OT
 * sale de una etapa de taller, el operario declara las horas en
 * `ot_stage_reports` (migración 20260827120000).
 *
 * Se compara cada OT contra SÍ MISMA: horas declaradas en una columna del
 * Kanban ÷ horas que el presupuesto le asignaba a esa columna. La mediana de esa
 * razón es el factor de la etapa. Comparar razones y no horas absolutas es lo que
 * permite usar un tiraje de 500 pliegos para corregir uno de 50.000 — un
 * promedio de horas mezclaría trabajos de tamaños que no tienen nada que ver.
 *
 * La mezcla con el presupuesto usa los mismos umbrales que ya tenía el RPC
 * (≥20 muestras: 70% historial; ≥5: 40%; menos: sólo presupuesto), para que el
 * criterio de "cuánto le creo al historial" no cambie de un lugar a otro.
 */

import { deriveRoute, quoteHoursByStatus, PLAN_STEP_BY_KEY, PLAN_STEPS, type RouteOT, type RouteStep } from '@/lib/production-route';

/** Qué tipos de máquina pueden hacer el trabajo de cada columna del Kanban. */
const STATUS_MACHINE_TYPES = new Map<string, Set<string>>();
for (const step of PLAN_STEPS) {
	const set = STATUS_MACHINE_TYPES.get(step.status) ?? new Set<string>();
	step.machineTypes.forEach((t) => set.add(t));
	STATUS_MACHINE_TYPES.set(step.status, set);
}

export interface StageReportRow {
	ot_id: string;
	workflow_step: string;
	hours: number | null;
	machine_id?: string | null;
}

export interface Calibration {
	/** Mediana de horas reales ÷ horas del presupuesto. */
	factor: number;
	samples: number;
}

export interface StageHistory {
	byStatus: Record<string, Calibration>;
	/** Clave `${status}:${machine_id}`. */
	byStatusMachine: Record<string, Calibration>;
}

/** Razones fuera de este rango son un error de tipeo (40 h donde iban 4), no un dato. */
const MIN_RATIO = 0.1;
const MAX_RATIO = 10;

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildStageHistory(
	reports: StageReportRow[],
	otsById: Map<string, RouteOT>,
	machineTypeById: Map<string, string> = new Map(),
): StageHistory {
	// Las pasadas parciales de una misma etapa se suman: el presupuesto habla de
	// la etapa entera, no de cada pasada.
	const actual = new Map<string, { hours: number; machines: Set<string> }>();
	for (const r of reports) {
		if (!r.hours || r.hours <= 0) continue;
		const key = `${r.ot_id}|${r.workflow_step}`;
		const acc = actual.get(key) ?? { hours: 0, machines: new Set<string>() };
		acc.hours += Number(r.hours);
		if (r.machine_id) acc.machines.add(r.machine_id);
		actual.set(key, acc);
	}

	const quotes = new Map<string, Map<string, number>>();
	const ratiosByStatus = new Map<string, number[]>();
	const ratiosByStatusMachine = new Map<string, number[]>();

	for (const [key, { hours, machines }] of actual) {
		const [otId, status] = key.split('|');
		const ot = otsById.get(otId);
		if (!ot) continue;
		if (!quotes.has(otId)) quotes.set(otId, quoteHoursByStatus(deriveRoute(ot, machineTypeById)));
		const quote = quotes.get(otId)!.get(status);
		if (!quote || quote <= 0) continue;
		const ratio = hours / quote;
		if (ratio < MIN_RATIO || ratio > MAX_RATIO) continue;

		ratiosByStatus.set(status, [...(ratiosByStatus.get(status) ?? []), ratio]);
		// Sólo se atribuye a una máquina cuando la etapa entera pasó por una sola
		// Y esa máquina puede hacer la etapa. El cierre de etapa rellena
		// `machine_id` con la máquina asignada a la OT (la prensa), así que sin
		// este filtro las horas de taller y de despacho calibraban la offset.
		const [machineId] = [...machines];
		if (machines.size === 1 && STATUS_MACHINE_TYPES.get(status)?.has(machineTypeById.get(machineId) ?? '')) {
			const mk = `${status}:${machineId}`;
			ratiosByStatusMachine.set(mk, [...(ratiosByStatusMachine.get(mk) ?? []), ratio]);
		}
	}

	const summarize = (m: Map<string, number[]>) =>
		Object.fromEntries([...m].map(([k, v]) => [k, { factor: Math.round(median(v) * 100) / 100, samples: v.length }]));

	return { byStatus: summarize(ratiosByStatus), byStatusMachine: summarize(ratiosByStatusMachine) };
}

export const EMPTY_HISTORY: StageHistory = { byStatus: {}, byStatusMachine: {} };

export type Confidence = 'alta' | 'media' | 'baja';

export interface Estimate {
	hours: number;
	quoteHours: number;
	factor: number | null;
	samples: number;
	confidence: Confidence;
	/** Peso del historial en la mezcla (0 = sólo presupuesto). */
	historyWeight: number;
}

/**
 * La estimación final de una etapa. Prefiere la calibración de la máquina
 * concreta cuando tiene muestras suficientes; si no, la de la columna.
 */
export function estimateStep(step: RouteStep, history: StageHistory, machineId?: string | null): Estimate {
	const status = PLAN_STEP_BY_KEY[step.key].status;
	const perMachine = machineId ? history.byStatusMachine[`${status}:${machineId}`] : undefined;
	const cal = perMachine && perMachine.samples >= 5 ? perMachine : history.byStatus[status];
	const samples = cal?.samples ?? 0;
	const historyWeight = samples >= 20 ? 0.7 : samples >= 5 ? 0.4 : 0;
	const factor = cal ? cal.factor : null;
	const hours = factor == null ? step.quoteHours : step.quoteHours * (1 - historyWeight + historyWeight * factor);
	return {
		hours: Math.round(hours * 100) / 100,
		quoteHours: step.quoteHours,
		factor,
		samples,
		confidence: samples >= 20 ? 'alta' : samples >= 5 ? 'media' : 'baja',
		historyWeight,
	};
}

/** Horas declaradas por columna, para una OT — lo que ya se hizo de la etapa en curso. */
export function reportedHoursByStatus(reports: StageReportRow[], otId: string): Map<string, number> {
	const out = new Map<string, number>();
	for (const r of reports) {
		if (r.ot_id !== otId || !r.hours) continue;
		out.set(r.workflow_step, (out.get(r.workflow_step) ?? 0) + Number(r.hours));
	}
	return out;
}
