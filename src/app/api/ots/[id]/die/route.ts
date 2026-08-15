import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Qué troquel usa esta OT.
 *
 * Elegir uno del estante es la decisión que ahorra $320.000 y dos semanas, y
 * tiene que poder tomarse desde Pre-Prensa sin abrir otra pantalla: una decisión
 * que cuesta tres clics es una decisión que no se toma.
 *
 * El contador de usos lo lleva un disparador sobre `ots.die_id`. Acá no se
 * incrementa nada a mano — hacerlo sería la segunda puerta al mismo número.
 */

const Schema = z.object({
	/** El del estante. `null` = se manda a hacer uno nuevo. */
	dieId: z.string().uuid().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor']);
	if (isAuthError(auth)) return auth;
	const { id } = await params;

	const parsed = Schema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

	const { error } = await supabaseAdmin
		.from('ots')
		.update({
			die_id: parsed.data.dieId,
			// Elegir del estante responde las dos preguntas de una: de dónde sale y
			// cuál es. Mandarlo a hacer responde la primera y deja la segunda para
			// cuando llegue.
			die_source: parsed.data.dieId ? 'existente' : 'nuevo',
		})
		.eq('id', id);

	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	return NextResponse.json({ ok: true });
}
