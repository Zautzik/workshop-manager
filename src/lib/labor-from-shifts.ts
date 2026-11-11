/**
 * La mano de obra real de una pasada, deducida de Planta.
 *
 * Regla del dueño (2026-11-11): la mano de obra de una OT es la gente que
 * Planta tenía asignada a la máquina, por las horas que la OT estuvo en su
 * turno. No se tipea, no viene del kiosco ni del parte: la pasada cerrada dice
 * cuántas horas estuvo la OT en la máquina, y Planta dice quién estaba ahí.
 *
 * ── Cómo se ubican las horas ───────────────────────────────────────────────
 *
 * La pasada sabe CUÁNDO se cerró y CUÁNTAS horas duró, no a qué hora empezó.
 * Las horas se colocan hacia atrás desde el cierre, sólo dentro de los turnos
 * de esa máquina (menos su colación): una pasada de 3 h cerrada a las 15:00 en
 * una máquina con Mañana 07–14 y Tarde 14–22 son 1 h de Tarde y 2 h de Mañana.
 * Cada persona asignada a la máquina en ese turno carga las horas que le tocan,
 * a su tarifa vigente ese día.
 *
 * Lo que no cae en ningún turno con gente asignada queda como «sin dotación»:
 * no se inventa quién estaba.
 *
 * Puro: sin base ni red. stage-valuation.ts trae los datos y escribe el libro.
 */

import { timeToMinutes, type ShiftTimes } from '@/lib/shift-hours';
import { plantParts, plantWallClockToMs } from '@/lib/plant-calendar';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Hasta dónde se busca hacia atrás. Una pasada no dura dos semanas de turnos. */
const LOOKBACK_DAYS = 14;

export interface CrewAssignment {
	employee_id: string;
	/** YYYY-MM-DD, el día en que EMPIEZA el turno. */
	date: string;
	shift_id: string;
}

export interface ShiftDef extends ShiftTimes {
	id: string;
	name: string;
}

export interface RateRow {
	employee_id: string;
	hourly_rate: number | string;
	effective_from: string;
	effective_to: string | null;
}

export interface LaborLine {
	employee_id: string;
	date: string;
	shift_name: string;
	hours: number;
	/** CLP por hora; null si la persona no tiene tarifa vigente ese día. */
	rate: number | null;
}

export interface PassLabor {
	lines: LaborLine[];
	/** Horas de la pasada que no cayeron en un turno con gente asignada. */
	uncoveredHours: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Los tramos trabajados de un turno un día dado (sin la colación), en ms UTC. */
export function shiftIntervals(date: string, shift: ShiftTimes): Array<[number, number]> {
	const [y, m, d] = date.split('-').map(Number);
	const start = timeToMinutes(shift.start_time);
	let end = timeToMinutes(shift.end_time);
	if (end <= start) end += 24 * 60; // cruza la medianoche
	const at = (minutes: number) =>
		plantWallClockToMs(y, m, d + Math.floor(minutes / (24 * 60)), minutes % (24 * 60));

	const breakMin = Math.max(0, shift.break_minutes ?? 0);
	if (shift.break_start && breakMin > 0) {
		let b = timeToMinutes(shift.break_start);
		if (b < start) b += 24 * 60;
		if (b > start && b + breakMin < end) {
			return [
				[at(start), at(b)],
				[at(b + breakMin), at(end)],
			];
		}
	}
	return [[at(start), at(end)]];
}

function rateOn(rates: RateRow[], employeeId: string, date: string): number | null {
	let best: RateRow | null = null;
	for (const r of rates) {
		if (r.employee_id !== employeeId) continue;
		if (r.effective_from > date) continue;
		if (r.effective_to && r.effective_to < date) continue;
		if (!best || r.effective_from > best.effective_from) best = r;
	}
	const n = best ? Number(best.hourly_rate) : NaN;
	return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Coloca `hours` hacia atrás desde `closedAtMs` sobre los turnos de la máquina
 * y reparte cada tramo entre quienes Planta asignó a ese turno.
 *
 * @param assignments las asignaciones de ESA máquina (cualquier rango de días;
 *   se ignoran las que no tocan la ventana).
 */
export function laborForPass(args: {
	closedAtMs: number;
	hours: number;
	assignments: CrewAssignment[];
	shifts: Map<string, ShiftDef>;
	rates: RateRow[];
}): PassLabor {
	const { closedAtMs, assignments, shifts, rates } = args;
	let remainingMs = Math.max(0, args.hours) * HOUR_MS;
	if (remainingMs === 0) return { lines: [], uncoveredHours: 0 };

	// Un tramo por (día, turno) con su gente.
	const windows = new Map<string, { date: string; shift: ShiftDef; crew: Set<string>; spans: Array<[number, number]> }>();
	const floor = closedAtMs - LOOKBACK_DAYS * DAY_MS;
	for (const a of assignments) {
		const shift = shifts.get(a.shift_id);
		if (!shift) continue;
		const key = `${a.date}|${a.shift_id}`;
		let w = windows.get(key);
		if (!w) {
			const spans = shiftIntervals(a.date, shift).filter(([s, e]) => e > floor && s < closedAtMs);
			if (spans.length === 0) continue;
			w = { date: a.date, shift, crew: new Set(), spans };
			windows.set(key, w);
		}
		w.crew.add(a.employee_id);
	}

	// Los tramos recortados al cierre.
	const pieces = [...windows.values()]
		.flatMap((w) => w.spans.map(([s, e]) => ({ w, s, e: Math.min(e, closedAtMs) })))
		.filter((p) => p.e > p.s);

	// Se recorre el tiempo en segmentos elementales (entre dos bordes de turno
	// cualesquiera), del más reciente al más antiguo. Dos turnos que se pisan
	// (Taller 07–16 y Mañana 07–14 en la misma máquina) no duplican las horas de
	// la OT: el segmento se cuenta una vez, y su gente es la de todos los turnos
	// que lo cubren.
	const bounds = [...new Set(pieces.flatMap((p) => [p.s, p.e]))].sort((a, b) => b - a);
	const hoursBy = new Map<string, LaborLine>();
	for (let i = 0; i + 1 < bounds.length && remainingMs > 0; i++) {
		const end = bounds[i];
		const start = bounds[i + 1];
		const crews = pieces.filter((q) => q.s <= start && q.e >= end).map((q) => q.w);
		if (crews.length === 0) continue; // hueco entre turnos: la máquina no tenía gente
		const takeMs = Math.min(remainingMs, end - start);
		for (const w of crews) {
			for (const employee of w.crew) {
				const key = `${employee}|${w.date}|${w.shift.id}`;
				const line = hoursBy.get(key) ?? {
					employee_id: employee,
					date: w.date,
					shift_name: w.shift.name,
					hours: 0,
					rate: rateOn(rates, employee, w.date),
				};
				line.hours += takeMs / HOUR_MS;
				hoursBy.set(key, line);
			}
		}
		remainingMs -= takeMs;
	}

	const lines = [...hoursBy.values()]
		.map((l) => ({ ...l, hours: round2(l.hours) }))
		.filter((l) => l.hours > 0)
		.sort((a, b) => a.date.localeCompare(b.date) || a.shift_name.localeCompare(b.shift_name));
	return { lines, uncoveredHours: round2(remainingMs / HOUR_MS) };
}

/** El día de planta (YYYY-MM-DD) de un instante: para acotar qué asignaciones traer. */
export function plantDate(ms: number): string {
	const p = plantParts(ms);
	return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export const LABOR_LOOKBACK_DAYS = LOOKBACK_DAYS;
