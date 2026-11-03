/**
 * Horas pagadas de un turno: de inicio a fin, menos la pausa no pagada.
 *
 * El Taller (07–16) son 8 h trabajadas y una colación sin goce (confirmado por
 * la planta, 2026-10-28). Antes cada pantalla calculaba fin − inicio por su
 * cuenta —cuatro copias— y contaba 9 h: el tope semanal frenaba un sábado que
 * cabía, la nómina pagaba la colación y el Cronograma planificaba el almuerzo.
 *
 * Es la misma regla que `public.shift_paid_hours` en la base (migración
 * 20261028120000), que usan la compuerta de cumplimiento y la nómina. Si cambia
 * una, cambia la otra.
 */

export interface ShiftTimes {
	start_time?: string | null;
	end_time?: string | null;
	/** Inicio de la pausa no pagada (HH:MM[:SS]); null si no tiene. */
	break_start?: string | null;
	/** Minutos de pausa no pagada. Antes de la migración no existe: cuenta 0. */
	break_minutes?: number | null;
}

export const timeToMinutes = (t?: string | null): number => {
	if (!t) return 0;
	const [h, m] = t.split(':').map(Number);
	return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

/** Duración bruta en minutos; un turno que termina "antes" de empezar cruza la medianoche. */
export function shiftGrossMinutes(shift: ShiftTimes | null | undefined): number {
	if (!shift) return 0;
	let minutes = timeToMinutes(shift.end_time) - timeToMinutes(shift.start_time);
	if (minutes <= 0) minutes += 24 * 60;
	return minutes;
}

export function shiftPaidHours(shift: ShiftTimes | null | undefined): number {
	if (!shift) return 0;
	return Math.max(0, shiftGrossMinutes(shift) - Math.max(0, shift.break_minutes ?? 0)) / 60;
}
