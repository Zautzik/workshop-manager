import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Declarar que la OT no lleva diseño.
 *
 * «Todavía no lo subieron» y «este trabajo no lleva» se ven idénticos en una
 * pantalla que sólo mira si hay archivo, y son cosas opuestas: una es un
 * pendiente que frena la prueba y la otra es una decisión tomada.
 *
 * Es la misma forma que ya usan las terminaciones: no llevar algo es una
 * respuesta, no un hueco.
 */

const Schema = z.object({ sinDiseno: z.boolean() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor']);
	if (isAuthError(auth)) return auth;
	const { id } = await params;

	const parsed = Schema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

	const { error } = await supabaseAdmin
		.from('ots')
		.update({ sin_arte: parsed.data.sinDiseno } as never)
		.eq('id', id);

	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	return NextResponse.json({ ok: true });
}
