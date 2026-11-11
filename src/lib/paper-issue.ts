/**
 * El papel sale de bodega UNA vez: al entrar a la primera etapa de la ruta.
 *
 * Regla del dueño (2026-11-11): el pliego que la guillotina toma para el
 * primer corte es el mismo que entra a la prensa y el mismo que va al troquel.
 * Las etapas siguientes mueven esos pliegos; volver a descontar ahí sería
 * contar el mismo papel dos veces. La merma de la prensa no es papel nuevo que
 * sale de bodega: es producto bueno que no salió.
 *
 * Y no toda OT pasa por el primer corte (una digital, papel que ya llega a
 * medida): la que no, consume al entrar a la primera etapa de SU ruta, que se
 * declara al crearla (`ots.route_steps`).
 *
 * Este módulo es puro: cuál es la etapa de entrada, cuántos pliegos siguen
 * pendientes y cómo se convierten a la unidad del lote (los lotes de papel se
 * llevan en kg; la máquina cuenta pliegos). paper-issue-server.ts trae los
 * datos y escribe.
 */

import { PLAN_STEP_BY_KEY, type PlanStepKey, type RouteStep } from '@/lib/production-route';
import { materialForPartial } from '@/lib/partial-advance';
import type { OTWorkflowStatus } from '@/lib/ot-state-machine';

/**
 * Las etapas que trabajan el pliego. La primera de ellas en la ruta es donde
 * el papel deja la bodega. Embalaje y despacho no: una OT que empieza ahí no
 * consume papel.
 */
const SHEET_STEPS: readonly PlanStepKey[] = [
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
];

/** La columna del Tablero donde sale el papel de esta ruta; `null` si la ruta no usa papel. */
export function paperEntryStatus(route: Pick<RouteStep, 'key'>[]): OTWorkflowStatus | null {
	const first = route.find((s) => SHEET_STEPS.includes(s.key));
	return first ? PLAN_STEP_BY_KEY[first.key].status : null;
}

/* ─── Unidades ─────────────────────────────────────────────────────────────── */

export interface PaperItem {
	unit: string | null;
	sheet_width_cm?: number | null;
	sheet_height_cm?: number | null;
	grammage_gsm?: number | null;
	sheets_per_package?: number | null;
}

const KG_UNITS = new Set(['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos']);
const PACK_UNITS = new Set(['resma', 'resmas', 'paquete', 'paquetes']);
const SHEET_UNITS = new Set(['pliego', 'pliegos', 'hoja', 'hojas', 'unit', 'und', 'unidad', 'unidades', '']);

const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * Cuánto de la unidad del lote es UN pliego.
 *
 * - kg: área del pliego del ítem × gramaje. Si el ítem no tiene medidas, el
 *   peso por pliego que supuso el presupuesto de la OT (kg ÷ pliegos).
 * - resma/paquete: 1 ÷ pliegos por paquete (500 si no lo dice).
 * - pliegos, unidades: 1.
 *
 * `null` = no se puede convertir (un ítem en kg sin medidas y una OT sin
 * cálculo, o un rollo): la salida se rechaza en vez de inventar un factor.
 */
export function perSheet(item: PaperItem, otFallback?: { calcKg?: number | null; calcSheets?: number | null }): number | null {
	const unit = (item.unit ?? '').trim().toLowerCase();
	if (KG_UNITS.has(unit)) {
		const w = Number(item.sheet_width_cm);
		const h = Number(item.sheet_height_cm);
		const g = Number(item.grammage_gsm);
		if (positive(w) && positive(h) && positive(g)) return ((w * h) / 10_000) * (g / 1000);
		const kg = Number(otFallback?.calcKg);
		const sheets = Number(otFallback?.calcSheets);
		if (positive(kg) && positive(sheets)) return kg / sheets;
		return null;
	}
	if (PACK_UNITS.has(unit)) {
		const per = Number(item.sheets_per_package);
		return 1 / (positive(per) ? per : 500);
	}
	return SHEET_UNITS.has(unit) ? 1 : null;
}

/** Pliegos → cantidad en la unidad del lote. kg con 3 decimales; lo demás, tal cual. */
export function sheetsToQuantity(sheets: number, factor: number): number {
	return Math.round(sheets * factor * 1000) / 1000;
}

/** Cantidad en la unidad del lote → pliegos (redondeado). */
export function quantityToSheets(quantity: number, factor: number): number {
	return factor > 0 ? Math.round(quantity / factor) : 0;
}

/* ─── Cuánto sale ──────────────────────────────────────────────────────────── */

export interface PendingInput {
	/** Pliegos del trabajo entero (`calc_sheets`, con su margen de arreglo). */
	calcSheets: number;
	/** De esos, cuántos son arreglo (se gastan una vez, con el primer fragmento). */
	makeReadySheets?: number;
	/** Unidades que entran a la etapa ahora. */
	movedUnits: number;
	/** Unidades del trabajo entero (todo el grupo de fragmentos). */
	groupUnits: number;
	/** Pliegos que ya salieron para este trabajo (cualquier fragmento, neto de devoluciones). */
	issuedSheets: number;
}

export interface PendingSheets {
	/** Pliegos sugeridos para esta salida. 0 = ya salió todo lo de este trabajo. */
	sheets: number;
	note: string;
}

/**
 * Los pliegos que corresponden a lo que entra ahora, sin pasar lo que falta
 * del trabajo: lo que ya salió (otro fragmento, o una vuelta atrás y adelante)
 * no vuelve a salir.
 */
export function pendingSheets(input: PendingInput): PendingSheets {
	const remaining = Math.max(0, Math.round(input.calcSheets - input.issuedSheets));
	if (remaining === 0) {
		return { sheets: 0, note: 'El papel de este trabajo ya salió de bodega.' };
	}
	const share = materialForPartial({
		movedUnits: input.movedUnits,
		totalUnits: input.groupUnits,
		totalSheets: input.calcSheets,
		makeReadySheets: input.makeReadySheets,
		isFirstFragment: input.issuedSheets <= 0,
	});
	const sheets = Math.min(share.sheets, remaining);
	const note =
		sheets < share.sheets
			? `Quedan ${remaining.toLocaleString('es-CL')} pliegos por salir de este trabajo.`
			: share.note;
	return { sheets, note };
}
