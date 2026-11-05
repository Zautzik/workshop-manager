import type { QueryClient } from '@tanstack/react-query';

/**
 * Lo que una revisión de parte puede cambiar, en un solo lugar.
 *
 * Aprobar un parte carga costos, mueve inventario, cierra la pasada de la etapa
 * y mueve la OT en el tablero — y cada pantalla de revisión refrescaba sólo su
 * propia lista, así que el tablero no se enteraba hasta recargar. Toda mutación
 * que revise un parte llama a esto; si mañana el parte toca algo más, se agrega
 * acá y lo heredan todas.
 */
export const REVIEW_AFFECTED_KEYS = [
	['whatsapp'],        // bandeja y resumen de WhatsApp
	['captures'],        // bandeja unificada
	['ots'],             // tablero (incluye ['ots', 'active'])
	['ot-open-passes'],  // pasadas abiertas del tablero
	['ot-cost-summary'], // costo real por OT
	['ot-real-costs'],
	['cost-alerts'],
	['inventory'],       // partes de bodega
] as const;

export function invalidateAfterReview(qc: QueryClient): void {
	for (const queryKey of REVIEW_AFFECTED_KEYS) qc.invalidateQueries({ queryKey: [...queryKey] });
}
