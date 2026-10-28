/**
 * Cuándo trabaja cada máquina: la regla única que comparten Planta y el
 * Cronograma.
 *
 * Tres capas, cada una responde una pregunta y se edita en un solo lugar:
 *
 *   `shifts` (con `code`)        QUÉ turnos existen y su horario.
 *   `machine_shift_patterns`     Qué turnos trabaja NORMALMENTE cada máquina,
 *                                y qué días.
 *   `worker_assignments`         QUIÉN está en qué máquina y turno, en una
 *                                fecha concreta (la dotación de Planta).
 *
 * La regla: una máquina produce en un turno en una fecha si
 *   - ese día la máquina tiene dotación cargada y alguien está en ese turno, o
 *   - ese día la máquina NO tiene dotación cargada y su patrón incluye el turno.
 *
 * La dotación manda POR MÁQUINA y POR DÍA, no por planta entera: cargar a Juan
 * en la Ryobi el jueves no cierra la guillotina ese jueves. Y es lo que abre
 * una noche: asignar operarios al turno Noche de una máquina hace que el
 * Cronograma la vea productiva esa noche y le ponga trabajo.
 *
 * Sin esta capa (antes de la migración 20261027140000, o una máquina sin
 * patrón ni dotación) se vuelve al supuesto por tipo (`calendarForMachineType`).
 */

import { plantParts, plantWallClockToMs, type PlantCalendar, type Shift } from '@/lib/plant-calendar';

export interface ShiftDef {
	id: string;
	code: string | null;
	name: string;
	start_time: string;
	end_time: string;
	is_night_shift?: boolean | null;
	sort_order?: number | null;
}

export interface ShiftPattern {
	machine_id: string;
	shift_id: string;
	weekdays: number[];
}

export interface RosterEntry {
	machine_id: string;
	shift_id: string;
	/** YYYY-MM-DD. */
	date: string;
	employee_name: string;
}

export interface ShiftModel {
	shifts: ShiftDef[];
	patterns: ShiftPattern[];
	roster: RosterEntry[];
}

const toMinutes = (t: string) => {
	const [h, m] = t.split(':').map(Number);
	return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

/** El horario de una definición en minutos; la que termina "antes" de empezar cruza la medianoche. */
export function shiftWindow(def: ShiftDef): Shift {
	const start = toMinutes(def.start_time);
	let end = toMinutes(def.end_time);
	if (end <= start) end += 24 * 60;
	return { name: def.name, start, end };
}

const hour = (min: number) => String(Math.floor((min % 1440) / 60)).padStart(2, '0');

/** «Mañana 07–14». */
export function shiftLabel(def: ShiftDef): string {
	const w = shiftWindow(def);
	return `${def.name} ${hour(w.start)}–${hour(w.end)}`;
}

export interface ShiftInstance {
	start: number;
	end: number;
	shift: ShiftDef;
	operators: string[];
	/** De dónde salió: la dotación cargada ese día, o el patrón habitual. */
	source: 'dotacion' | 'patron';
}

export interface ShiftResolver {
	/** Las definiciones vigentes, en orden. */
	definitions: ShiftDef[];
	/**
	 * El calendario de la máquina, o `fallback` si no tiene patrón ni dotación.
	 *
	 * `station` (1, 2, …) es el puesto dentro de una máquina de varios puestos
	 * (el taller manual). Un día con dotación, el puesto n sólo trabaja los turnos
	 * que tienen al menos n personas: dos operarios el sábado abren dos puestos,
	 * no los ocho.
	 */
	calendarFor(machineId: string, fallback: PlantCalendar, station?: number): PlantCalendar;
	/** Los turnos concretos de la máquina (o de su puesto `station`) en un rango, con quién está. */
	instances(machineId: string, fromMs: number, toMs: number, station?: number): ShiftInstance[];
}

const dateKeyOf = (y: number, m: number, d: number) =>
	`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const bySortOrder = (a: ShiftDef, b: ShiftDef) =>
	(a.sort_order ?? 0) - (b.sort_order ?? 0) || a.start_time.localeCompare(b.start_time);

export function createShiftResolver(model: ShiftModel): ShiftResolver {
	const defs = [...model.shifts].sort(bySortOrder);
	const defById = new Map(defs.map((d) => [d.id, d]));

	const patternsByMachine = new Map<string, ShiftPattern[]>();
	for (const p of model.patterns) {
		if (!defById.has(p.shift_id)) continue;
		patternsByMachine.set(p.machine_id, [...(patternsByMachine.get(p.machine_id) ?? []), p]);
	}

	// Dotación por máquina y día: qué turnos, y quién en cada uno. Llega ya
	// expresada en definiciones vigentes (`definitionFor`, en la ruta); una fila
	// que no corresponde a ninguna se ignora.
	const rosterByMachineDay = new Map<string, Map<string, string[]>>();
	for (const r of model.roster) {
		if (!defById.has(r.shift_id)) continue;
		const key = `${r.machine_id}|${r.date}`;
		const byShift = rosterByMachineDay.get(key) ?? new Map<string, string[]>();
		byShift.set(r.shift_id, [...(byShift.get(r.shift_id) ?? []), r.employee_name]);
		rosterByMachineDay.set(key, byShift);
	}
	const machinesWithRoster = new Set(model.roster.filter((r) => defById.has(r.shift_id)).map((r) => r.machine_id));

	const shiftsOn = (machineId: string, dateKey: string, weekday: number, station = 1) => {
		const roster = rosterByMachineDay.get(`${machineId}|${dateKey}`);
		if (roster && roster.size > 0) {
			// Puesto n: sólo los turnos con n personas o más, y la persona n en él.
			// Con un solo puesto (station 1) se ve toda la dotación del turno.
			return {
				source: 'dotacion' as const,
				items: [...roster]
					.filter(([, operators]) => operators.length >= station)
					.map(([id, operators]) => ({ def: defById.get(id)!, operators: station > 1 ? [operators[station - 1]] : operators })),
			};
		}
		const items = (patternsByMachine.get(machineId) ?? [])
			.filter((p) => p.weekdays.includes(weekday))
			.map((p) => ({ def: defById.get(p.shift_id)!, operators: [] as string[] }));
		return { source: 'patron' as const, items };
	};

	return {
		definitions: defs,

		calendarFor(machineId, fallback, station = 1) {
			const pattern = patternsByMachine.get(machineId) ?? [];
			if (pattern.length === 0 && !machinesWithRoster.has(machineId)) return fallback;
			const names = pattern.map((p) => defById.get(p.shift_id)!).sort(bySortOrder);
			return {
				key: station > 1 ? `maquina:${machineId}#${station}` : `maquina:${machineId}`,
				label: names.length > 0 ? names.map(shiftLabel).join(' + ') : 'Sólo con dotación',
				days: [],
				shifts: [],
				dayShifts: (dateKey, weekday) => shiftsOn(machineId, dateKey, weekday, station).items.map((i) => shiftWindow(i.def)),
			};
		},

		instances(machineId, fromMs, toMs, station = 1) {
			const out: ShiftInstance[] = [];
			// Desde el día anterior: la Noche de ayer puede seguir abierta.
			const p = plantParts(fromMs);
			for (let i = -1; i <= 400; i++) {
				const date = new Date(Date.UTC(p.year, p.month - 1, p.day + i));
				const y = date.getUTCFullYear();
				const m = date.getUTCMonth() + 1;
				const d = date.getUTCDate();
				if (plantWallClockToMs(y, m, d, 0) >= toMs) break;
				const { source, items } = shiftsOn(machineId, dateKeyOf(y, m, d), date.getUTCDay(), station);
				for (const { def, operators } of items) {
					const w = shiftWindow(def);
					const start = plantWallClockToMs(y, m, d, w.start);
					const end = plantWallClockToMs(y, m, d, w.end);
					if (end > fromMs && start < toMs) out.push({ start, end, shift: def, operators, source });
				}
			}
			return out.sort((a, b) => a.start - b.start);
		},
	};
}

/**
 * La definición vigente que corresponde a una fila de `shifts`, vigente o no.
 *
 * Las asignaciones cargadas antes de la migración 20261027140000 apuntan a filas
 * archivadas («Turno Día 07–15», «Turno Noche 23–07») y se dejaron así a
 * propósito: la nómina calcula sus horas desde esa fila. Pero para VER la
 * dotación —Planta y el Cronograma— una dotación ya cargada para mañana no puede
 * desaparecer porque su turno es una fila vieja: se lee como la definición con
 * la que más se solapa su horario. Sólo lectura; la asignación no cambia.
 *
 * El Taller sólo es candidato para el taller manual (`machineType`): un
 * «Turno Día 07–15» de una prensa se solapa más con Taller 07–16 que con Mañana
 * 07–14, y es Mañana.
 *
 * `null` si no se solapa con ninguna.
 */
export function definitionFor(
	row: Pick<ShiftDef, 'id' | 'start_time' | 'end_time'> | null | undefined,
	allDefs: ShiftDef[],
	machineType?: string | null,
): ShiftDef | null {
	if (!row) return null;
	const own = allDefs.find((d) => d.id === row.id);
	if (own) return own;
	if (!row.start_time || !row.end_time) return null;
	const defs = machineType === 'manual_workshop' ? allDefs : allDefs.filter((d) => d.code !== 'taller');

	const w = shiftWindow({ id: row.id, code: null, name: '', start_time: row.start_time, end_time: row.end_time });
	const overlap = (def: ShiftDef) => {
		const d = shiftWindow(def);
		// Las dos ventanas pueden cruzar la medianoche: se compara también un día corrido.
		let best = 0;
		for (const shift of [-1440, 0, 1440]) {
			best = Math.max(best, Math.min(w.end, d.end + shift) - Math.max(w.start, d.start + shift));
		}
		return best;
	};
	let match: ShiftDef | null = null;
	let matchOverlap = 0;
	for (const def of [...defs].sort(bySortOrder)) {
		const o = overlap(def);
		if (o > matchOverlap) {
			match = def;
			matchOverlap = o;
		}
	}
	return match;
}

/** La definición que cubre una hora del día (para "abrir turno aquí"); prefiere las nocturnas. */
export function shiftCovering(defs: ShiftDef[], minuteOfDay: number): ShiftDef | null {
	const covers = (def: ShiftDef) => {
		const w = shiftWindow(def);
		return (minuteOfDay >= w.start && minuteOfDay < w.end) || (minuteOfDay + 1440 >= w.start && minuteOfDay + 1440 < w.end);
	};
	return defs.find((d) => d.is_night_shift && covers(d)) ?? defs.find((d) => d.code !== 'taller' && covers(d)) ?? defs.find(covers) ?? null;
}
