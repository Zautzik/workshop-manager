/**
 * La única puerta de escritura de `whatsapp_warehouse_logs`, idempotente por
 * wamid.
 *
 * Meta entrega al-menos-una-vez. Bodega deduplicaba sólo con una ventana de 60
 * segundos (mismo ítem, operador y acción): un reintento que llega minutos
 * después creaba otro movimiento pendiente, y aprobar los dos movía el stock
 * dos veces. La llave real es el wamid, con un índice único parcial
 * (20261127120000) — la misma disciplina que producción
 * (`insert_whatsapp_log_idempotent`): se ATRAPA la violación de unicidad en vez
 * de adivinarla con un SELECT previo, así dos entregas simultáneas no pasan las
 * dos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

type LogInsert = Database['public']['Tables']['whatsapp_warehouse_logs']['Insert'];

export type WarehouseLogResult =
	| { ok: true; id: string; duplicate: boolean }
	| { ok: false; error: string };

export async function insertWarehouseLog(
	db: SupabaseClient<Database>,
	row: Omit<LogInsert, 'external_message_id'>,
	wamid: string | null,
): Promise<WarehouseLogResult> {
	const { data, error } = await db
		.from('whatsapp_warehouse_logs')
		.insert({ ...row, external_message_id: wamid })
		.select('id')
		.single();

	if (!error && data) return { ok: true, id: data.id, duplicate: false };

	if (error?.code === '23505' && wamid != null) {
		const { data: existing, error: lookupError } = await db
			.from('whatsapp_warehouse_logs')
			.select('id')
			.eq('external_message_id', wamid)
			.maybeSingle();
		if (existing) return { ok: true, id: existing.id, duplicate: true };
		if (lookupError) return { ok: false, error: lookupError.message };
	}

	return { ok: false, error: error?.message ?? 'No se pudo registrar el movimiento de bodega' };
}
