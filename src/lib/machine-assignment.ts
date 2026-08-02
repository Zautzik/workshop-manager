/**
 * Elegir máquina para una OT en la Hoja de Producción.
 *
 * La lista de máquinas asignables se sacaba de los turnos YA programados de ese
 * día, así que con la agenda vacía no había ninguna que ofrecer y la celda decía
 * "Sin máquinas". Una máquina sólo aparecía cuando ya tenía trabajo encima:
 * imposible programar la primera OT del día. La lista tiene que venir de la
 * flota, que es lo que este módulo ordena y agrupa.
 */

export type MachineRole = 'impresion' | 'terminacion' | 'corte' | 'apoyo' | 'despacho';

/**
 * Qué hace cada tipo de máquina en el taller. Un camión de reparto y la
 * guillotina no compiten por el mismo trabajo, y ofrecerlos mezclados en un
 * mismo desplegable obliga a leer los 17 nombres cada vez.
 */
export const MACHINE_ROLE: Record<string, MachineRole> = {
	offset_printer: 'impresion',
	digital_printer: 'impresion',
	folder: 'terminacion',
	collator: 'terminacion',
	stitcher: 'terminacion',
	perfect_binder: 'terminacion',
	laminator: 'terminacion',
	die_cutter: 'terminacion',
	guillotine: 'corte',
	manual_workshop: 'apoyo',
	delivery: 'despacho',
};

/** Orden de presentación: primero donde se imprime, al final lo que no produce. */
export const ROLE_ORDER: readonly MachineRole[] = [
	'impresion',
	'terminacion',
	'corte',
	'apoyo',
	'despacho',
] as const;

export const ROLE_LABEL: Record<MachineRole, string> = {
	impresion: 'Impresión',
	terminacion: 'Terminación',
	corte: 'Corte',
	apoyo: 'Apoyo',
	despacho: 'Despacho',
};

export function machineRole(type: string | null | undefined): MachineRole {
	return MACHINE_ROLE[type ?? ''] ?? 'apoyo';
}

export interface MachineLike {
	id: string;
	name: string;
	type?: string | null;
	status?: string | null;
}

export interface MachineGroup<T extends MachineLike> {
	role: MachineRole;
	label: string;
	machines: T[];
}

/**
 * Agrupa la flota por función y ordena por nombre dentro de cada grupo.
 * Los grupos vacíos no se devuelven, para no dibujar encabezados huecos.
 */
export function groupMachinesForAssignment<T extends MachineLike>(
	machines: readonly T[],
): MachineGroup<T>[] {
	const buckets = new Map<MachineRole, T[]>();

	for (const m of machines) {
		const role = machineRole(m.type);
		const bucket = buckets.get(role);
		if (bucket) bucket.push(m);
		else buckets.set(role, [m]);
	}

	return ROLE_ORDER.filter((role) => buckets.get(role)?.length).map((role) => ({
		role,
		label: ROLE_LABEL[role],
		machines: [...buckets.get(role)!].sort((a, b) => a.name.localeCompare(b.name, 'es')),
	}));
}

// ── Horario sugerido ────────────────────────────────────────────────────────

export interface OtHoursLike {
	calc_print_hours?: number | null;
	calc_finish_hours?: number | null;
}

/** Jornada por defecto cuando la OT no trae horas calculadas. */
export const DEFAULT_START = '08:00';
export const DEFAULT_END = '17:00';

/** La OT ya trae sus horas estimadas del asistente de costeo. */
export function estimatedHours(ot: OtHoursLike | null | undefined): number | null {
	if (!ot) return null;
	const print = typeof ot.calc_print_hours === 'number' && Number.isFinite(ot.calc_print_hours) ? ot.calc_print_hours : null;
	const finish = typeof ot.calc_finish_hours === 'number' && Number.isFinite(ot.calc_finish_hours) ? ot.calc_finish_hours : null;
	if (print == null && finish == null) return null;
	const total = (print ?? 0) + (finish ?? 0);
	return total > 0 ? total : null;
}

function toMinutes(hhmm: string): number {
	const [h, m] = hhmm.split(':').map(Number);
	return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function toHHMM(minutes: number): string {
	// El turno no puede cruzar la medianoche: la agenda es por día y un fin
	// "menor" que el inicio se leería como una duración negativa.
	const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
	const h = Math.floor(clamped / 60);
	const m = clamped % 60;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface SuggestedSlot {
	start: string;
	end: string;
	/** Horas estimadas de la OT, o null si no las trae. */
	hours: number | null;
}

/**
 * Propone inicio y fin para el turno a partir de las horas que la propia OT ya
 * calculó. Antes se ofrecía 08:00–17:00 fijo para todo, lo que hacía que una OT
 * de dos horas bloqueara la máquina el día entero en la hoja.
 */
export function suggestedSlot(
	ot: OtHoursLike | null | undefined,
	start: string = DEFAULT_START,
): SuggestedSlot {
	const hours = estimatedHours(ot);
	if (hours == null) return { start, end: DEFAULT_END, hours: null };

	return { start, end: toHHMM(toMinutes(start) + hours * 60), hours };
}
