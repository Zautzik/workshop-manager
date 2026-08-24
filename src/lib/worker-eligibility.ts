/**
 * Si una persona puede tomar un turno en una estación, y qué tan buena
 * candidata es frente a otras — la parte de Planta que decide el
 * llenado automático y el "reemplazar por".
 *
 * Vivía dentro de PlantaBoard.tsx como funciones que cerraban sobre
 * variables del componente (`workers`, `workerIndicatorsById`,
 * `compensationByEmployee`). Acá toman esos datos como parámetros
 * explícitos — la única diferencia real es que ahora se puede probar sin
 * montar el componente, que es exactamente lo que le faltaba a esta
 * lógica (auditoría 2026-08).
 */
import { isWorkerQualifiedForStation } from '@/lib/workstation-skills';

export interface WorkerConflictFlags {
	/** Tiene una licencia/vacación que choca con el día. */
	leaveConflict: boolean;
	/** Asignarla violaría un límite legal de horas. */
	legalConflict: boolean;
	/** No tiene la competencia que la estación exige. */
	missingSkill: boolean;
}

export interface WorkerIndicator {
	leaveTone?: string;
	legalHourConflict?: boolean;
}

/** Sin id de trabajador no hay con qué evaluar — se trata como el peor caso,
 *  no como "sin conflicto". */
export function workerConflictFlags(
	workerId: string | null | undefined,
	worker: unknown,
	station: unknown,
	indicator: WorkerIndicator | undefined,
): WorkerConflictFlags {
	if (!workerId) {
		return { leaveConflict: true, legalConflict: true, missingSkill: false };
	}
	return {
		leaveConflict: indicator?.leaveTone === 'alert',
		legalConflict: Boolean(indicator?.legalHourConflict),
		missingSkill: station ? !isWorkerQualifiedForStation(worker, station) : false,
	};
}

export function isWorkerEligibleForStation(
	worker: { id?: string | null; overtime_availability?: boolean } | null | undefined,
	station: unknown,
	isOvertime: boolean,
	indicator: WorkerIndicator | undefined,
): boolean {
	const conflicts = workerConflictFlags(worker?.id, worker, station, indicator);
	if (conflicts.leaveConflict || conflicts.legalConflict || conflicts.missingSkill) return false;
	if (isOvertime && !worker?.overtime_availability) return false;
	return true;
}

/**
 * Más alto es mejor candidata. Rating pesa más que costo a propósito —
 * llenar el turno con la persona más barata y no con la más apta es
 * optimizar la métrica equivocada.
 */
export function workerSortScore(
	worker: { overall_rating?: number } | null | undefined,
	hourlyRate: number,
	isOvertime: boolean,
): number {
	const rating = Number(worker?.overall_rating || 0);
	const overtimePenalty = isOvertime ? 10 : 0;
	return rating * 2 - hourlyRate * 0.05 - overtimePenalty;
}
