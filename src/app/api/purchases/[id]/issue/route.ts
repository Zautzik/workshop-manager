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
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	// Emitir compromete plata con un tercero. No es una acción de operario.
	const auth = await requireAuth(['admin', 'manager', 'supervisor']);
	if (isAuthError(auth)) return auth;
	const { id } = await params;

	// Sólo importa si el proveedor está bloqueado — en ese caso, la base exige
	// este motivo para dejar pasar la emisión igual. Cuerpo vacío es el caso
	// normal y no rompe nada.
	const body = await req.json().catch(() => ({}));
	const overrideReason = typeof body?.override_reason === 'string' ? body.override_reason : null;

	const { data, error } = await supabaseAdmin.rpc('emitir_oc' as never, {
		p_purchase_id: id,
		p_issued_by: auth.id,
		p_supplier_override_reason: overrideReason,
	} as never);

	if (error) {
		// Los mensajes de la función están escritos para que se puedan mostrar
		// tal cual: dicen qué pasó y qué hacer.
		return NextResponse.json({ error: error.message }, { status: 409 });
	}

	const oc = Array.isArray(data) ? data[0] : data;
	return NextResponse.json({ oc, mensaje: `Emitida como ${(oc as { oc_number?: string })?.oc_number}` });
}
