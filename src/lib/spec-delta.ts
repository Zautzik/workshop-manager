/**
 * Cuántos pliegos más necesita una OT hoy que los que se planearon la última
 * vez que alguien miró su papel.
 *
 * Dos pantallas hacen esta misma pregunta con datos distintos: el presupuesto
 * («¿hay que sumar una línea de sustrato?», comparando contra `calc_sheets`
 * anterior) y Compras («¿hay que sugerir un requisito más?», comparando contra
 * la cantidad de la fila de papel ya resuelta). Si cada una restara por su
 * cuenta, el día que una cambiara de criterio la otra se quedaría contestando
 * una pregunta distinta con el mismo nombre — por eso viven acá y no en cada
 * componente.
 */
export function sheetShortfall(
	currentSheets: number | null | undefined,
	plannedSheets: number | null | undefined,
): number {
	const current = Math.max(0, Number(currentSheets) || 0);
	const planned = Math.max(0, Number(plannedSheets) || 0);
	return Math.max(0, Math.round(current - planned));
}
