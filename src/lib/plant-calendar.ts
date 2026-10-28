/**
 * El calendario de la planta: cuándo se trabaja en cada máquina.
 *
 * Pasar de "esta etapa toma 4 h" a "termina el jueves a las 11:00" exige saber
 * qué horas existen. Hasta ahora la única respuesta en el repositorio era un
 * `DEFAULT_SHIFT_HOURS = 9` dentro de la ruta del plan semanal, que no distingue
 * la prensa (dos turnos) del taller (uno), ni sabe a qué hora empieza nada.
 *
 * Turnos declarados por la planta (2026-10-27):
 * - La planta trabaja de 07:00 a 22:00, en dos turnos (07–14 y 14–22): prensas,
 *   guillotinas, troqueladora, digital, laminado, plegado y despacho.
 * - La única excepción es el taller manual: un turno, 07:00–16:00.
 * Lunes a viernes. Si se agrega el sábado, es una línea en `days`.
 *
 * Todo se calcula en la hora de la planta (America/Santiago), no en la del
 * servidor ni la del navegador: Vercel corre en UTC, y un turno de 07:00
 * calculado ahí empezaría a las 03:00 o 04:00 del taller según la época del año.
 */

export const PLANT_TZ = 'America/Santiago';

export type CalendarKey = 'dos_turnos' | 'taller' | (string & {});

export interface Shift {
	name: string;
	/**
	 * Minutos desde la medianoche, hora de la planta. `end` puede pasar de 1440:
	 * la Noche 22–07 es `start: 1320, end: 1860` y termina al día siguiente.
	 */
	start: number;
	end: number;
}

export interface PlantCalendar {
	key: CalendarKey;
	label: string;
	/** 0 = domingo … 6 = sábado. */
	days: number[];
	shifts: Shift[];
	/**
	 * Turnos de un día concreto, si dependen de la fecha (patrón de la máquina
	 * + dotación de Planta, ver `machine-calendar.ts`). Si está, manda sobre
	 * `days`/`shifts`.
	 */
	dayShifts?: (dateKey: string, weekday: number) => Shift[];
}

const LUNES_A_VIERNES = [1, 2, 3, 4, 5];

export const CALENDARS: Record<CalendarKey, PlantCalendar> = {
	dos_turnos: {
		key: 'dos_turnos',
		label: 'Dos turnos (07–14, 14–22)',
		days: LUNES_A_VIERNES,
		shifts: [
			{ name: 'Mañana', start: 7 * 60, end: 14 * 60 },
			{ name: 'Tarde', start: 14 * 60, end: 22 * 60 },
		],
	},
	taller: {
		key: 'taller',
		label: 'Taller (07–16)',
		days: LUNES_A_VIERNES,
		shifts: [{ name: 'Taller', start: 7 * 60, end: 16 * 60 }],
	},
};

/** Lo que trabaja un solo turno; todo lo demás sigue el horario de la planta. */
const TALLER_TYPES = new Set(['manual_workshop']);

export function calendarForMachineType(type: string | null | undefined): PlantCalendar {
	return TALLER_TYPES.has(type ?? '') ? CALENDARS.taller : CALENDARS.dos_turnos;
}

/* ─── Zona horaria sin dependencias ─────────────────────────────────────────── */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const partsFormatter = new Intl.DateTimeFormat('en-US', {
	timeZone: PLANT_TZ,
	hourCycle: 'h23',
	year: 'numeric',
	month: 'numeric',
	day: 'numeric',
	hour: 'numeric',
	minute: 'numeric',
	second: 'numeric',
});

export interface PlantParts {
	year: number;
	month: number; // 1-12
	day: number;
	hour: number;
	minute: number;
	weekday: number; // 0 = domingo
}

export function plantParts(ms: number): PlantParts {
	const p: Record<string, number> = {};
	for (const part of partsFormatter.formatToParts(new Date(ms))) {
		if (part.type !== 'literal') p[part.type] = Number(part.value);
	}
	const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
	return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute, weekday };
}

/** Cuánto adelanta (positivo) o atrasa la planta respecto de UTC en ese instante. */
function plantOffsetMs(ms: number): number {
	const p = plantParts(ms);
	const s = new Date(ms).getUTCSeconds();
	return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, s) - Math.floor(ms / 1000) * 1000;
}

/** El instante UTC de una hora de reloj de la planta. */
export function plantWallClockToMs(year: number, month: number, day: number, minutes: number): number {
	const guess = Date.UTC(year, month - 1, day, 0, minutes);
	const first = guess - plantOffsetMs(guess);
	// Una segunda pasada corrige el caso en que el cambio de horario cae entre
	// la suposición y el resultado.
	return guess - plantOffsetMs(first);
}

/* ─── Tiempo hábil ─────────────────────────────────────────────────────────── */

export type Interval = [number, number];

/**
 * Los tramos hábiles del calendario, en orden, desde el día de `fromMs`.
 * Generador para no tener que decidir de antemano cuántos días hacen falta.
 */
export function* workingIntervals(cal: PlantCalendar, fromMs: number, maxDays = 400): Generator<Interval> {
	const p = plantParts(fromMs);
	// Turnos contiguos o solapados se funden en un solo tramo: la máquina no se
	// detiene en el cambio de turno (14:00), ni al pasar de la Noche (22–07) a
	// la Mañana del día siguiente. Por eso el tramo abierto (`open`) cruza días.
	let open: Interval | null = null;
	// Se empieza el día ANTERIOR: una Noche que empezó ayer a las 22:00 sigue
	// abierta a las 03:00 de hoy.
	for (let i = -1; i < maxDays; i++) {
		const date = new Date(Date.UTC(p.year, p.month - 1, p.day + i));
		const weekday = date.getUTCDay();
		const y = date.getUTCFullYear();
		const m = date.getUTCMonth() + 1;
		const d = date.getUTCDate();
		const shifts = cal.dayShifts
			? cal.dayShifts(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, weekday)
			: cal.days.includes(weekday)
				? cal.shifts
				: [];
		for (const shift of [...shifts].sort((a, b) => a.start - b.start)) {
			const s = plantWallClockToMs(y, m, d, shift.start);
			const e = plantWallClockToMs(y, m, d, shift.end);
			if (open && s <= open[1]) {
				open[1] = Math.max(open[1], e);
				continue;
			}
			if (open && open[1] > fromMs) yield [Math.max(open[0], fromMs), open[1]];
			open = [s, e];
		}
	}
	if (open && open[1] > fromMs) yield [Math.max(open[0], fromMs), open[1]];
}

/** El primer instante hábil en o después de `ms`. */
export function nextWorkingInstant(cal: PlantCalendar, ms: number): number {
	for (const [s] of workingIntervals(cal, ms)) return s;
	return ms;
}

/** El instante en que se completan `hours` horas hábiles empezando en `ms`. */
export function addWorkingHours(cal: PlantCalendar, ms: number, hours: number): number {
	let remaining = Math.max(0, hours) * HOUR_MS;
	if (remaining === 0) return nextWorkingInstant(cal, ms);
	for (const [s, e] of workingIntervals(cal, ms)) {
		const span = e - s;
		if (remaining <= span) return s + remaining;
		remaining -= span;
	}
	return ms + remaining;
}

/** Horas hábiles entre dos instantes (0 si `b` es anterior a `a`). */
export function workingHoursBetween(cal: PlantCalendar, a: number, b: number): number {
	if (b <= a) return 0;
	let total = 0;
	for (const [s, e] of workingIntervals(cal, a)) {
		if (s >= b) break;
		total += Math.min(e, b) - s;
	}
	return total / HOUR_MS;
}

/** Medianoche (hora de la planta) del día de `ms`. */
export function plantStartOfDay(ms: number): number {
	const p = plantParts(ms);
	return plantWallClockToMs(p.year, p.month, p.day, 0);
}

/**
 * El plazo de una OT como instante: el FIN del día comprometido.
 *
 * `ots.deadline` se guarda como medianoche UTC de la fecha elegida
 * (`2026-08-17T00:00:00+00:00`), que en Chile es las 20:00 o 21:00 del día
 * ANTERIOR. Leerlo como instante adelantaba cada plazo un día. La fecha que
 * eligió la persona es la parte de fecha del texto; el compromiso vence al
 * terminar ese día en la planta.
 */
export function deadlineToMs(deadline: string | null | undefined): number | null {
	if (!deadline) return null;
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(deadline);
	if (!m) return null;
	return plantWallClockToMs(Number(m[1]), Number(m[2]), Number(m[3]), 24 * 60) - 1;
}

export const MS = { HOUR: HOUR_MS, DAY: DAY_MS };

/* ─── Eje de tiempo del Cronograma ─────────────────────────────────────────── */

export interface AxisDay {
	start: number;
	end: number;
	/** Píxel donde empieza el día. */
	x: number;
}

export interface TimeAxis {
	start: number;
	end: number;
	width: number;
	days: AxisDay[];
	/** Instante → píxel. Lo que cae fuera de turno se pega al borde del tramo. */
	xOf: (ms: number) => number;
	/** Píxel → instante (para arrastrar). */
	msAt: (x: number) => number;
}

/**
 * Un eje que sólo tiene las horas en que la planta trabaja: las noches y los
 * fines de semana no ocupan espacio. Con un eje de 24 h, de 22:00 a 07:00 era
 * un tercio del gráfico mostrando nada, y una OT que cruzaba la noche se
 * dibujaba como si la prensa hubiera corrido de madrugada.
 *
 * Los tramos salen del calendario más amplio (`dos_turnos`, 07–22); el taller,
 * que cierra a las 16, se ve dentro de ese tramo como fuera de turno.
 */
export function buildTimeAxis(cal: PlantCalendar, fromMs: number, workingDays: number, pxPerHour: number): TimeAxis {
	const segments: Interval[] = [];
	for (const seg of workingIntervals(cal, plantStartOfDay(fromMs))) {
		if (segments.length >= workingDays) break;
		segments.push(seg);
	}
	return axisFromSegments(segments, pxPerHour, fromMs);
}

/**
 * Días completos de 24 h, noches y fines de semana incluidos. Es la vista por
 * defecto del Cronograma: una noche sin turno se VE vacía —y se puede abrir un
 * turno ahí desde Planta— en vez de desaparecer del gráfico.
 */
export function fullDaySegments(fromMs: number, days: number): Interval[] {
	const p = plantParts(fromMs);
	return Array.from({ length: days }, (_, i) => {
		const s = plantWallClockToMs(p.year, p.month, p.day + i, 0);
		const e = plantWallClockToMs(p.year, p.month, p.day + i + 1, 0);
		return [s, e] as Interval;
	});
}

/** Une tramos que se tocan o se solapan, en orden. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
	const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
	const out: Interval[] = [];
	for (const [s, e] of sorted) {
		const last = out[out.length - 1];
		if (last && s <= last[1]) last[1] = Math.max(last[1], e);
		else out.push([s, e]);
	}
	return out;
}

/** Un eje que sólo tiene los tramos dados, pegados uno detrás de otro. */
export function axisFromSegments(segments: Interval[], pxPerHour: number, fallbackMs: number): TimeAxis {
	const days: AxisDay[] = [];
	let x = 0;
	for (const [s, e] of segments) {
		days.push({ start: s, end: e, x });
		x += ((e - s) / HOUR_MS) * pxPerHour;
	}
	const width = x;
	const start = days[0]?.start ?? fallbackMs;
	const end = days[days.length - 1]?.end ?? fallbackMs;

	const xOf = (ms: number) => {
		for (const d of days) {
			if (ms <= d.start) return d.x;
			if (ms <= d.end) return d.x + ((ms - d.start) / HOUR_MS) * pxPerHour;
		}
		return width;
	};
	const msAt = (px: number) => {
		for (const d of days) {
			const w = ((d.end - d.start) / HOUR_MS) * pxPerHour;
			if (px <= d.x + w) return d.start + (Math.max(px - d.x, 0) / pxPerHour) * HOUR_MS;
		}
		return end;
	};

	return { start, end, width, days, xOf, msAt };
}
