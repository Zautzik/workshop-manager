/**
 * Lo que una persona cambió a mano sobre un turno de rotación, para que
 * regenerar la rotación no lo deshaga.
 *
 * - Quitar un turno de rotación (faltó, se cambió de día) deja un "salto" en
 *   `rotation_skips`: el generador no vuelve a poner a esa persona ese día.
 * - Editar uno lo convierte en 'manual': ya no es de la rotación, y el
 *   generador no pisa un día con un turno manual.
 *
 * Lee las filas con `*` a propósito: antes de la migración 20261103120000 no
 * existen `source` ni `rotation_id`, y entonces no hay nada que recordar.
 */

import { supabaseAdmin } from '@/integrations/supabase/server';

type Row = { rotation_id?: string | null; employee_id?: string | null; date?: string | null; source?: string | null };

export async function rememberRemovedRotationRows(rows: Row[]): Promise<void> {
	const skips = rows
		.filter((r) => r.rotation_id && r.employee_id && r.date && r.source === 'rotacion')
		.map((r) => ({ rotation_id: r.rotation_id!, employee_id: r.employee_id!, date: r.date! }));
	if (skips.length === 0) return;
	const { error } = await (supabaseAdmin as any)
		.from('rotation_skips')
		.upsert(skips, { onConflict: 'rotation_id,employee_id,date', ignoreDuplicates: true });
	// No frena el borrado: lo peor que pasa es que regenerar devuelva ese turno.
	if (error) console.warn('No se pudo recordar el turno quitado de la rotación:', error.message);
}

/** El parche de una edición a mano: si la fila era de rotación, deja de serlo. */
export function manualEditPatch(row: Row): Record<string, string> {
	return row.source === 'rotacion' ? { source: 'manual' } : {};
}
