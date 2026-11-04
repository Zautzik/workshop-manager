/**
 * Rotaciones de turno: quién trabaja qué turno cada semana, sin cargarlo a mano.
 *
 * ── El modelo ───────────────────────────────────────────────────────────────
 *
 * Una ROTACIÓN es un grupo de EQUIPOS que se reparten una lista ordenada de
 * turnos (p. ej. Mañana → Tarde), en ciertos días, y avanza una posición cada
 * lunes. Un equipo es una lista de «persona → máquina»: una cuadrilla de prensa
 * de tres, o un solo guillotinero. Para el sistema son lo mismo.
 *
 * La regla, una sola: la semana `w` (contada desde la semana de referencia), el
 * equipo en la posición `p` trabaja el turno `(p + w) mod equipos`. Si ese número
 * no tiene turno (más equipos que turnos), el equipo descansa esa semana.
 *
 *   dos equipos, Mañana/Tarde        → alternan cada lunes (lo de hoy)
 *   un equipo, un turno              → turno fijo (el Taller)
 *   tres equipos, Mañana/Tarde/Noche → rotación de tres
 *   tres equipos, Mañana/Tarde       → dos trabajan, uno descansa, por turnos
 *
 * Sábado, opcional: el equipo que esa semana está en `saturdayShiftId` también
 * trabaja ese turno el sábado. Como cada rotación cubre sus máquinas, queda UN
 * equipo por máquina el sábado (decisión de la planta, 2026-11-03).
 *
 * Es la misma idea que ya usaba la rotación de sábados (derivar de la semana del
 * calendario, sin contabilidad a mano), aplicada a equipos enteros.
 */

export interface RotationMember {
	employee_id: string;
	machine_id: string;
	role: string;
}

export interface RotationTeam {
	id: string;
	name: string;
	/** Orden en la rotación: en la semana de referencia, el equipo 0 hace el primer turno. */
	position: number;
	members: RotationMember[];
}

export interface Rotation {
	id: string;
	name: string;
	/** Turnos en el orden en que se recorren (definiciones de `shifts`). */
	shift_ids: string[];
	/** Días de la semana que se trabajan (0 = domingo). */
	weekdays: number[];
	/** El equipo que esa semana está en este turno también lo trabaja el sábado. */
	saturday_shift_id: string | null;
	/** Lunes de la semana de referencia (YYYY-MM-DD). */
	anchor_week: string;
	active: boolean;
	teams: RotationTeam[];
}

export interface PlannedAssignment {
	rotation_id: string;
	team_id: string;
	employee_id: string;
	machine_id: string;
	shift_id: string;
	date: string;
	role: string;
}

const DAY = 86_400_000;
const utc = (dateKey: string) => Date.parse(`${dateKey}T12:00:00Z`);
const keyOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** El lunes de la semana de una fecha (YYYY-MM-DD). */
export function mondayOf(dateKey: string): string {
	const ms = utc(dateKey);
	const dow = new Date(ms).getUTCDay();
	return keyOf(ms - ((dow + 6) % 7) * DAY);
}

export function addDays(dateKey: string, days: number): string {
	return keyOf(utc(dateKey) + days * DAY);
}

/** Semanas enteras entre el lunes de referencia y el lunes de `monday` (puede ser negativo). */
export function weeksSince(anchorWeek: string, dateKey: string): number {
	return Math.round((utc(mondayOf(dateKey)) - utc(mondayOf(anchorWeek))) / (7 * DAY));
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** El turno que hace un equipo la semana de `dateKey`, o `null` si descansa. */
export function teamShift(rotation: Pick<Rotation, 'shift_ids' | 'anchor_week' | 'teams'>, position: number, dateKey: string): string | null {
	const n = rotation.teams.length;
	if (n === 0) return null;
	const slot = mod(position + weeksSince(rotation.anchor_week, dateKey), n);
	return rotation.shift_ids[slot] ?? null;
}

export interface WeekSummary {
	monday: string;
	teams: Array<{ team: RotationTeam; shiftId: string | null; saturday: boolean }>;
}

/** Quién hace qué la semana de `dateKey`: lo que muestran la tarjeta y la vista previa. */
export function describeWeek(rotation: Rotation, dateKey: string): WeekSummary {
	const teams = [...rotation.teams].sort((a, b) => a.position - b.position);
	return {
		monday: mondayOf(dateKey),
		teams: teams.map((team) => {
			const shiftId = teamShift(rotation, team.position, dateKey);
			return { team, shiftId, saturday: !!rotation.saturday_shift_id && shiftId === rotation.saturday_shift_id };
		}),
	};
}

/**
 * Las asignaciones que la rotación pide entre `from` y `to` (inclusive).
 * Pura: no sabe de licencias ni de cambios a mano — eso lo decide quien escribe.
 */
export function planRotation(rotation: Rotation, from: string, to: string): PlannedAssignment[] {
	if (!rotation.active || rotation.teams.length === 0 || rotation.shift_ids.length === 0) return [];
	const out: PlannedAssignment[] = [];
	for (let ms = utc(from); ms <= utc(to); ms += DAY) {
		const date = keyOf(ms);
		const dow = new Date(ms).getUTCDay();
		for (const team of rotation.teams) {
			const weekShift = teamShift(rotation, team.position, date);
			if (!weekShift) continue;
			let shift: string | null = null;
			if (rotation.weekdays.includes(dow)) shift = weekShift;
			else if (dow === 6 && rotation.saturday_shift_id && weekShift === rotation.saturday_shift_id) shift = rotation.saturday_shift_id;
			if (!shift) continue;
			for (const m of team.members) {
				out.push({ rotation_id: rotation.id, team_id: team.id, employee_id: m.employee_id, machine_id: m.machine_id, shift_id: shift, date, role: m.role });
			}
		}
	}
	return out;
}

/**
 * Lo que está mal armado, en palabras del supervisor. Se revisa al guardar para
 * que una rotación imposible no llegue a generar nada.
 */
export function validateRotation(rotation: Rotation, others: Rotation[] = []): string[] {
	const problems: string[] = [];
	if (!rotation.name.trim()) problems.push('Ponle un nombre a la rotación.');
	if (rotation.shift_ids.length === 0) problems.push('Elige al menos un turno.');
	if (new Set(rotation.shift_ids).size !== rotation.shift_ids.length) problems.push('Un turno aparece dos veces en la rotación.');
	if (rotation.teams.length === 0) problems.push('Agrega al menos un equipo.');
	if (rotation.teams.length < rotation.shift_ids.length) {
		problems.push(`Hay ${rotation.shift_ids.length} turnos y ${rotation.teams.length} equipo(s): algún turno quedaría sin nadie.`);
	}
	if (rotation.weekdays.length === 0) problems.push('Elige los días que se trabajan.');
	if (rotation.saturday_shift_id) {
		if (rotation.weekdays.includes(6)) problems.push('El sábado ya está entre los días de trabajo: no hace falta la regla del sábado.');
		if (!rotation.shift_ids.includes(rotation.saturday_shift_id)) problems.push('El turno del sábado tiene que ser uno de los de la rotación.');
	}
	rotation.teams.forEach((t) => {
		if (t.members.length === 0) problems.push(`«${t.name}» no tiene a nadie.`);
	});

	// Una persona en dos equipos (de esta u otra rotación activa) recibiría dos turnos el mismo día.
	const seen = new Map<string, string>();
	for (const r of [rotation, ...others.filter((o) => o.id !== rotation.id && o.active)]) {
		for (const t of r.teams) {
			for (const m of t.members) {
				const where = `${r.name} / ${t.name}`;
				const prev = seen.get(m.employee_id);
				if (prev && prev !== where) problems.push(`Una persona está en dos equipos (${prev} y ${where}).`);
				seen.set(m.employee_id, where);
			}
		}
	}
	return [...new Set(problems)];
}

export interface ExistingAssignment {
	id: string;
	employee_id: string;
	date: string;
	source?: string | null;
	rotation_id?: string | null;
}

export interface SkippedAssignment extends PlannedAssignment {
	reason: 'manual' | 'licencia' | 'quitado';
}

/**
 * Qué escribir al generar, sin tocar la base. Lo que hizo una persona manda
 * sobre lo que dice la rotación:
 *
 * - un día con un turno MANUAL de esa persona no se toca;
 * - un día en que alguien la QUITÓ del turno de rotación (`rotation_skips`) no
 *   se repone;
 * - un día con licencia o vacaciones aprobadas no se le asigna.
 *
 * Los turnos que la misma rotación generó antes se reemplazan enteros (`remove`):
 * si se cambió un equipo o el orden, la semana se rehace.
 */
export function decideRotationWrites(input: {
	planned: PlannedAssignment[];
	existing: ExistingAssignment[];
	rotationIds: string[];
	skips: Array<{ rotation_id: string; employee_id: string; date: string }>;
	leaves: Array<{ employee_id: string; start_date: string; end_date: string }>;
}): { remove: string[]; insert: PlannedAssignment[]; skipped: SkippedAssignment[] } {
	const ours = new Set(input.rotationIds);
	const remove = input.existing.filter((e) => e.source === 'rotacion' && e.rotation_id && ours.has(e.rotation_id)).map((e) => e.id);
	const removed = new Set(remove);
	const manual = new Set(input.existing.filter((e) => !removed.has(e.id)).map((e) => `${e.employee_id}|${e.date}`));
	const skip = new Set(input.skips.map((s) => `${s.rotation_id}|${s.employee_id}|${s.date}`));
	const onLeave = (p: PlannedAssignment) => input.leaves.some((l) => l.employee_id === p.employee_id && l.start_date <= p.date && p.date <= l.end_date);

	const insert: PlannedAssignment[] = [];
	const skipped: SkippedAssignment[] = [];
	for (const p of input.planned) {
		if (skip.has(`${p.rotation_id}|${p.employee_id}|${p.date}`)) skipped.push({ ...p, reason: 'quitado' });
		else if (manual.has(`${p.employee_id}|${p.date}`)) skipped.push({ ...p, reason: 'manual' });
		else if (onLeave(p)) skipped.push({ ...p, reason: 'licencia' });
		else insert.push(p);
	}
	// Por fecha: la compuerta de cumplimiento revisa descanso y horas contra los días anteriores.
	insert.sort((a, b) => a.date.localeCompare(b.date));
	return { remove, insert, skipped };
}
