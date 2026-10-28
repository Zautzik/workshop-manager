/**
 * La ruta de producción de una OT: por qué etapas pasa, en qué máquinas, y
 * cuántas horas le tocan a cada una.
 *
 * El Kanban sabe en qué columna está una OT, no por cuáles va a pasar: los 15
 * estados son una sola fila y `FORWARD_TRANSITIONS` deja saltar a cualquiera.
 * Para planificar hace falta la ruta concreta —esta OT es offset + troquel +
 * desglose + embalaje, sin digital ni guillotina final— y eso se deduce de la
 * especificación que la OT ya guarda (colores, `finish_*`, troquel, tipo de
 * producto).
 *
 * ── Etapas del plan vs. columnas del Kanban ─────────────────────────────────
 *
 * El plan tiene más detalle que el Kanban: el desglose de lo troquelado, la
 * revisión de etiquetas y el embalaje son trabajo real, con horas y operario,
 * que no tienen columna propia. Cada etapa del plan VIVE dentro de una columna
 * (`status`), y es esa columna la que dice si la etapa ya pasó: todo lo que
 * vive antes de la columna actual de la OT está hecho; lo que vive en ella está
 * en curso. Así el Kanban sigue siendo la única verdad de dónde está la OT, y
 * moverla ahí mueve el plan sin una segunda fuente que pueda contradecirlo.
 *
 * ── Horas ───────────────────────────────────────────────────────────────────
 *
 * El presupuesto (`computeOTCalculations`) calcula las horas por proceso y
 * guarda sólo dos totales: `calc_print_hours` y `calc_finish_hours`.
 * `estimatedHoursFor` (stage-report.ts) se negó con razón a repartir esos
 * totales "a ojo". Acá no se reparten a ojo: se recalcula cada proceso con las
 * MISMAS fórmulas (`finishHoursFor`, sobre `calc_sheets`, que sí está guardado)
 * y, si el total guardado difiere del recalculado —porque el presupuesto usó la
 * velocidad de una máquina concreta—, se escalan para que sumen lo que dijo el
 * presupuesto. Lo que el presupuesto no cubre (guillotina, desglose, revisión,
 * embalaje, despacho) sale de `ASSUMED_RATES` y queda marcado como supuesto.
 */

import { CALIBRATION, colorCount, finishHoursFor, pressPasses } from '@/lib/ot-calculations';
import type { OTColorMode } from '@/types/ot';
import { OTStatusSchema, type OTWorkflowStatus } from '@/lib/ot-state-machine';

export const PLAN_STEP_KEYS = [
	'corte_inicial',
	'offset',
	'digital',
	'laminado',
	'troquelado',
	'corte_final',
	'desglose',
	'plegado',
	'terminaciones',
	'tercerizado',
	'revision_etiquetas',
	'embalaje',
	'despacho',
] as const;

export type PlanStepKey = (typeof PLAN_STEP_KEYS)[number];

export interface PlanStepDef {
	key: PlanStepKey;
	label: string;
	/** La columna del Kanban dentro de la que vive esta etapa. */
	status: OTWorkflowStatus;
	/** Tipos de máquina que pueden hacerla, en orden de preferencia. */
	machineTypes: string[];
}

/**
 * En orden de flujo. El laminado vive en la columna de troquelado porque se
 * hace antes de troquelar y el Kanban no tiene columna propia para él.
 */
export const PLAN_STEPS: readonly PlanStepDef[] = [
	{ key: 'corte_inicial', label: 'Corte inicial', status: 'guillotine_first_cut', machineTypes: ['guillotine'] },
	{ key: 'offset', label: 'Impresión offset', status: 'offset_printing', machineTypes: ['offset_printer'] },
	{ key: 'digital', label: 'Impresión digital', status: 'digital_printing', machineTypes: ['digital_printer'] },
	{ key: 'laminado', label: 'Laminado', status: 'die_cutting', machineTypes: ['laminator'] },
	{ key: 'troquelado', label: 'Troquelado', status: 'die_cutting', machineTypes: ['die_cutter'] },
	{ key: 'corte_final', label: 'Corte final', status: 'guillotine_final_cut', machineTypes: ['guillotine'] },
	{ key: 'desglose', label: 'Desglose', status: 'workshop', machineTypes: ['manual_workshop'] },
	{ key: 'plegado', label: 'Plegado / pegado', status: 'workshop', machineTypes: ['folder'] },
	{ key: 'terminaciones', label: 'Terminaciones', status: 'workshop', machineTypes: ['manual_workshop'] },
	{ key: 'tercerizado', label: 'Tercerizado', status: 'outsourced', machineTypes: [] },
	{ key: 'revision_etiquetas', label: 'Revisión de etiquetas', status: 'workshop_revision', machineTypes: ['manual_workshop'] },
	{ key: 'embalaje', label: 'Embalaje', status: 'workshop_revision', machineTypes: ['manual_workshop'] },
	{ key: 'despacho', label: 'Despacho', status: 'in_delivery', machineTypes: ['delivery'] },
];

export const PLAN_STEP_BY_KEY = Object.fromEntries(PLAN_STEPS.map((s) => [s.key, s])) as Record<
	PlanStepKey,
	PlanStepDef
>;

export function isPlanStepKey(value: unknown): value is PlanStepKey {
	return typeof value === 'string' && (PLAN_STEP_KEYS as readonly string[]).includes(value);
}

/**
 * Tasas de lo que el presupuesto no calcula. Son SUPUESTOS de partida, no
 * mediciones: cada bloque que las usa lo dice en pantalla, y el factor del
 * historial (`stage-history.ts`) las corrige a medida que el taller declara
 * horas reales al cerrar cada etapa.
 */
export const ASSUMED_RATES = {
	/** Desglose manual de lo troquelado: pliegos por hora + preparación. */
	desglose: { setupH: 0.25, sheetsPerHour: 1500 },
	/** Revisión de etiquetas: unidades por hora + preparación. */
	revision_etiquetas: { setupH: 0.25, unitsPerHour: 20000 },
	/** Embalaje: unidades por hora + preparación. */
	embalaje: { setupH: 0.25, unitsPerHour: 10000 },
	/** Un viaje de despacho. */
	despachoH: 2,
	/** Sin dato del proveedor, un día hábil de taller. */
	tercerizadoH: 9,
} as const;

/** Lo mínimo que una etapa en curso conserva aunque el historial diga que ya se pasó. */
const MIN_REMAINING_FRACTION = 0.15;
const MIN_REMAINING_H = 0.25;

const STATUS_ORDER = OTStatusSchema.options;
const statusIndex = (s: string) => STATUS_ORDER.indexOf(s as OTWorkflowStatus);

/** Lo que la ruta necesita saber de una OT — subconjunto de la fila de `ots`. */
export interface RouteOT {
	id: string;
	status: string;
	quantity?: number | null;
	product_type?: string | null;
	color_front?: string | null;
	color_back?: string | null;
	calc_sheets?: number | null;
	calc_print_hours?: number | null;
	calc_finish_hours?: number | null;
	assigned_machine_id?: string | null;
	die_id?: string | null;
	die_code?: string | null;
	flag_paper_arrived?: boolean | null;
	finish_troquelado?: boolean | null;
	finish_plegado?: boolean | null;
	finish_pegado?: boolean | null;
	finish_laminado?: boolean | null;
	finish_barniz?: boolean | null;
	finish_relieve?: boolean | null;
	finish_perforado?: boolean | null;
	finish_hot_stamping?: boolean | null;
	finish_uv_localizado?: boolean | null;
	finish_numeracion?: boolean | null;
}

export type EstimateSource = 'presupuesto' | 'supuesto';

/** Colores por cara: lo que decide cuántas pasadas —y cuántos ajustes— hace una prensa. */
export interface SetupColors {
	front: number;
	back: number;
}

export interface RouteStep {
	key: PlanStepKey;
	/** Horas según el presupuesto (o el supuesto), antes del historial. */
	quoteHours: number;
	source: EstimateSource;
	/**
	 * Sólo offset. El ajuste depende de la prensa (cuerpos y minutos de ajuste
	 * de `machines`), así que no se fija acá: el planificador lo suma al elegir
	 * máquina. `quoteHours` incluye el ajuste que el presupuesto supuso
	 * (`quoteSetupHours`), que hay que restar para no contarlo dos veces.
	 */
	setupColors?: SetupColors;
	quoteSetupHours?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const positive = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

function sheetsOf(ot: RouteOT): number {
	if (positive(ot.calc_sheets)) return ot.calc_sheets;
	// Sin imposición calculada, una unidad por pliego es el peor caso honesto.
	return Math.max(0, Number(ot.quantity ?? 0));
}

function isDieCut(ot: RouteOT): boolean {
	return Boolean(ot.finish_troquelado || ot.die_id || ot.die_code);
}

function printsAtAll(ot: RouteOT): boolean {
	const blank = (c: string | null | undefined) => !c || c === 'sin_impresion';
	return positive(ot.calc_print_hours) || !blank(ot.color_front) || !blank(ot.color_back);
}

/**
 * Digital u offset. La OT no guarda el método de impresión; lo dicen, en este
 * orden, la columna en que está y el tipo de la máquina asignada.
 */
function isDigital(ot: RouteOT, machineTypeById: Map<string, string>): boolean {
	if (ot.status === 'digital_printing') return true;
	if (ot.status === 'offset_printing') return false;
	const assigned = ot.assigned_machine_id ? machineTypeById.get(ot.assigned_machine_id) : undefined;
	return assigned === 'digital_printer';
}

const OTHER_FINISHES = ['barniz', 'relieve', 'perforado', 'hot_stamping', 'uv_localizado', 'numeracion'] as const;

/**
 * La ruta completa de la OT, de principio a fin, ignorando dónde está hoy.
 * `remainingRoute` recorta lo ya hecho.
 */
export function deriveRoute(ot: RouteOT, machineTypeById: Map<string, string> = new Map()): RouteStep[] {
	const sheets = sheetsOf(ot);
	const units = Math.max(0, Number(ot.quantity ?? 0));
	const steps: RouteStep[] = [];
	const dieCut = isDieCut(ot);

	if (printsAtAll(ot)) {
		const digital = isDigital(ot, machineTypeById);
		if (!digital) {
			steps.push({ key: 'corte_inicial', quoteHours: finishHoursFor('corte', sheets), source: 'supuesto' });
		}
		if (digital) {
			const formula = sheets / CALIBRATION.DEFAULT_DIGITAL_SHEETS_PER_HOUR;
			steps.push({
				key: 'digital',
				quoteHours: positive(ot.calc_print_hours) ? ot.calc_print_hours : round2(formula),
				source: positive(ot.calc_print_hours) ? 'presupuesto' : 'supuesto',
			});
		} else {
			// Las mismas pasadas que supuso el presupuesto (prensa de 4 cuerpos si
			// no se eligió otra), para saber cuánto de sus horas era ajuste.
			const setupColors = {
				front: colorCount((ot.color_front ?? 'sin_impresion') as OTColorMode) ?? 0,
				back: colorCount((ot.color_back ?? 'sin_impresion') as OTColorMode) ?? 0,
			};
			const passes = Math.max(1, pressPasses(setupColors.front, setupColors.back, CALIBRATION.DEFAULT_PRESS_BODIES));
			const quoteSetupHours = passes * CALIBRATION.MAKEREADY_HOURS_PER_PASS;
			const formula = quoteSetupHours + (passes * sheets) / CALIBRATION.DEFAULT_SHEETS_PER_HOUR;
			steps.push({
				key: 'offset',
				quoteHours: positive(ot.calc_print_hours) ? ot.calc_print_hours : round2(formula),
				source: positive(ot.calc_print_hours) ? 'presupuesto' : 'supuesto',
				setupColors,
				quoteSetupHours,
			});
		}
	}

	// Terminaciones del presupuesto: se recalculan por proceso y luego se
	// escalan al total guardado (ver cabecera).
	const finishing: RouteStep[] = [];
	if (ot.finish_laminado) finishing.push({ key: 'laminado', quoteHours: finishHoursFor('laminado', sheets), source: 'presupuesto' });
	if (dieCut) finishing.push({ key: 'troquelado', quoteHours: finishHoursFor('troquelado', sheets), source: 'presupuesto' });
	const plegado =
		(ot.finish_plegado ? finishHoursFor('plegado', sheets) : 0) + (ot.finish_pegado ? finishHoursFor('pegado', sheets) : 0);
	if (plegado > 0) finishing.push({ key: 'plegado', quoteHours: plegado, source: 'presupuesto' });
	const otras = OTHER_FINISHES.reduce(
		(sum, f) => sum + (ot[`finish_${f}` as keyof RouteOT] ? finishHoursFor(f, sheets) : 0),
		0,
	);
	if (otras > 0) finishing.push({ key: 'terminaciones', quoteHours: otras, source: 'presupuesto' });

	const recomputed = finishing.reduce((s, f) => s + f.quoteHours, 0);
	const scale = positive(ot.calc_finish_hours) && recomputed > 0 ? ot.calc_finish_hours / recomputed : 1;
	const byKey = new Map(finishing.map((f) => [f.key, { ...f, quoteHours: round2(f.quoteHours * scale) }]));

	if (byKey.has('laminado')) steps.push(byKey.get('laminado')!);
	if (byKey.has('troquelado')) steps.push(byKey.get('troquelado')!);
	if (!dieCut && printsAtAll(ot)) {
		steps.push({ key: 'corte_final', quoteHours: finishHoursFor('corte', sheets), source: 'supuesto' });
	}
	if (dieCut) {
		const r = ASSUMED_RATES.desglose;
		steps.push({ key: 'desglose', quoteHours: round2(r.setupH + sheets / r.sheetsPerHour), source: 'supuesto' });
	}
	if (byKey.has('plegado')) steps.push(byKey.get('plegado')!);
	if (byKey.has('terminaciones')) steps.push(byKey.get('terminaciones')!);

	if (ot.status === 'outsourced') {
		steps.push({ key: 'tercerizado', quoteHours: ASSUMED_RATES.tercerizadoH, source: 'supuesto' });
	}
	if (ot.product_type === 'etiqueta') {
		const r = ASSUMED_RATES.revision_etiquetas;
		steps.push({ key: 'revision_etiquetas', quoteHours: round2(r.setupH + units / r.unitsPerHour), source: 'supuesto' });
	}
	const e = ASSUMED_RATES.embalaje;
	steps.push({ key: 'embalaje', quoteHours: round2(e.setupH + units / e.unitsPerHour), source: 'supuesto' });
	steps.push({ key: 'despacho', quoteHours: ASSUMED_RATES.despachoH, source: 'supuesto' });

	return steps;
}

/** Horas del presupuesto agrupadas por columna del Kanban — lo que compara el historial. */
export function quoteHoursByStatus(route: RouteStep[]): Map<string, number> {
	const out = new Map<string, number>();
	for (const step of route) {
		const status = PLAN_STEP_BY_KEY[step.key].status;
		out.set(status, (out.get(status) ?? 0) + step.quoteHours);
	}
	return out;
}

export interface RemainingStep extends RouteStep {
	/**
	 * Horas a planificar: estimación ajustada menos lo ya declarado si está en
	 * curso. En offset es SÓLO el tiraje; el ajuste lo suma el planificador según
	 * la prensa.
	 */
	hours: number;
	/** La estimación completa de la etapa (sin ajuste en offset), antes de descontar lo hecho. */
	estimatedHours: number;
	inProgress: boolean;
	/** El ajuste ya se hizo: la etapa está en curso y el taller ya declaró horas. */
	setupDone?: boolean;
}

/**
 * Lo que le falta a la OT, según la columna en que está.
 *
 * @param estimate convierte las horas del presupuesto en la estimación final
 *   (la que mezcla el historial); identidad si no hay historial.
 * @param reportedByStatus horas ya declaradas en `ot_stage_reports` por columna.
 */
export function remainingRoute(
	ot: RouteOT,
	route: RouteStep[],
	estimate: (step: RouteStep) => number = (s) => s.quoteHours,
	reportedByStatus: Map<string, number> = new Map(),
): RemainingStep[] {
	const current = statusIndex(ot.status);
	if (ot.status === 'completed') return [];

	const consumed = new Map(reportedByStatus);
	const out: RemainingStep[] = [];
	for (const step of route) {
		const idx = statusIndex(PLAN_STEP_BY_KEY[step.key].status);
		if (idx < current) continue;
		const full = Math.max(estimate(step), 0);
		// En offset se planifica sólo el tiraje: se le quita la parte del
		// presupuesto que era ajuste, en la misma proporción que el historial
		// haya corregido el total.
		const runShare =
			step.setupColors && step.quoteHours > 0
				? Math.max(step.quoteHours - (step.quoteSetupHours ?? 0), step.quoteHours * 0.1) / step.quoteHours
				: 1;
		const estimatedHours = round2(full * runShare);
		const inProgress = idx === current;
		let hours = estimatedHours;
		let setupDone = false;
		if (inProgress) {
			const status = PLAN_STEP_BY_KEY[step.key].status;
			const used = consumed.get(status) ?? 0;
			const take = Math.min(used, estimatedHours);
			consumed.set(status, used - take);
			setupDone = used > 0;
			hours = Math.max(estimatedHours - take, estimatedHours * MIN_REMAINING_FRACTION, MIN_REMAINING_H);
		}
		out.push({ ...step, hours: round2(hours), estimatedHours, inProgress, ...(step.setupColors ? { setupDone } : {}) });
	}
	return out;
}

/** Por qué una OT todavía no puede entrar a producción, si es el caso. */
export function blockedReason(ot: RouteOT): string | null {
	switch (ot.status) {
		case 'pre_press':
			return 'En pre-prensa';
		case 'visto_bueno':
			return 'Esperando visto bueno';
		case 'paper_purchase':
			return ot.flag_paper_arrived ? null : 'Esperando papel';
		default:
			return null;
	}
}

/**
 * La etapa de un bloque de `ot_machine_schedule` que no la guardó (filas de
 * antes de `plan_step`): la primera de la ruta que esa máquina puede hacer.
 */
export function inferPlanStep(machineType: string | null | undefined, route: RouteStep[]): PlanStepKey | null {
	if (!machineType) return null;
	const hit = route.find((s) => PLAN_STEP_BY_KEY[s.key].machineTypes.includes(machineType));
	return hit?.key ?? null;
}
