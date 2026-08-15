import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { canVoid, type OCStatus } from '@/lib/purchasing';

export const dynamic = 'force-dynamic';

/**
 * Anular una OC.
 *
 * No hay borrado. Una OC emitida existió, comprometió plata con un proveedor y
 * consumió un número; hacerla desaparecer deja un hueco en el correlativo, que
 * es la primera cosa que una auditoría mira y la más difícil de explicar.
 *
 * Anular conserva el número, el proveedor y los montos, y agrega tres datos:
 * quién, cuándo y por qué.
 */

const Schema = z.object({
	// El motivo es obligatorio y con largo mínimo: «error» no explica nada, y una
	// anulación sin explicación es indistinguible de un encubrimiento.
	reason: z.string().min(10, 'El motivo tiene que explicar qué pasó.').max(500),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireAuth(['admin', 'manager']);
	if (isAuthError(auth)) return auth;
	const { id } = await params;

	const parsed = Schema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: parsed.error.issues[0]?.message ?? 'Falta el motivo de la anulación.' },
			{ status: 400 },
		);
	}

	const { data: oc, error: errorLectura } = await supabaseAdmin
		.from('purchases')
		.select('id, oc_number, status')
		.eq('id', id)
		.maybeSingle();

	if (errorLectura) return NextResponse.json({ error: errorLectura.message }, { status: 500 });
	if (!oc) return NextResponse.json({ error: 'OC no encontrada.' }, { status: 404 });

	if (!canVoid(oc.status as OCStatus)) {
		return NextResponse.json(
			{
				error:
					oc.status === 'draft'
						? 'Un borrador no se anula: se descarta. Nunca fue un documento.'
						: `Una OC ${oc.status === 'cancelled' ? 'ya anulada' : 'cerrada'} no se puede anular.`,
			},
			{ status: 409 },
		);
	}

	const { error } = await supabaseAdmin
		.from('purchases')
		.update({
			status: 'cancelled',
			voided_by: auth.id,
			voided_at: new Date().toISOString(),
			voided_reason: parsed.data.reason.trim(),
			updated_at: new Date().toISOString(),
		})
		.eq('id', id)
		// Guarda de concurrencia: si alguien la movió mientras leíamos, no la pisamos.
		.eq('status', oc.status);

	if (error) return NextResponse.json({ error: error.message }, { status: 500 });

	return NextResponse.json({ ok: true, mensaje: `${oc.oc_number} quedó anulada. El número se conserva.` });
}
