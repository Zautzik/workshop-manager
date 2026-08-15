import { NextRequest, NextResponse } from 'next/server';

import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Emitir una OC.
 *
 * El acto que convierte un borrador en documento: le asigna el correlativo, la
 * firma con quién y cuándo, y la cierra a edición.
 *
 * Todo el trabajo lo hace `emitir_oc` en la base y no esta ruta, por una razón
 * concreta: el número sale de una secuencia dentro de la misma transacción que
 * cambia el estado. Si lo calculara la aplicación —leer el último y sumar uno—
 * dos pestañas abiertas emitirían el mismo número, y una numeración con
 * duplicados es tan indefendible frente a una auditoría como una con huecos.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	// Emitir compromete plata con un tercero. No es una acción de operario.
	const auth = await requireAuth(['admin', 'manager', 'supervisor']);
	if (isAuthError(auth)) return auth;
	const { id } = await params;

	const { data, error } = await supabaseAdmin.rpc('emitir_oc' as never, {
		p_purchase_id: id,
		p_issued_by: auth.id,
	} as never);

	if (error) {
		// Los mensajes de la función están escritos para que se puedan mostrar
		// tal cual: dicen qué pasó y qué hacer.
		return NextResponse.json({ error: error.message }, { status: 409 });
	}

	const oc = Array.isArray(data) ? data[0] : data;
	return NextResponse.json({ oc, mensaje: `Emitida como ${(oc as { oc_number?: string })?.oc_number}` });
}
