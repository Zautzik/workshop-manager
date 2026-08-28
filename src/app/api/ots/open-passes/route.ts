import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { fetchAll } from '@/lib/fetch-all';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ots/open-passes — qué OT deben horas, y de qué etapas.
 *
 * Existe porque una deuda que no se ve no se paga. Mover una tarjeta ya no
 * exige declarar cuánto tomó la etapa —eso frenaba el taller sin conseguir el
 * dato—, así que lo que queda es que la OT lo MUESTRE: una marca en la tarjeta
 * mientras la pasada siga abierta, y el nombre de la etapa al pasar el mouse.
 *
 * Va aparte de `/api/ots` a propósito. El tablero pide las OT una vez y las
 * cachea; las pasadas abiertas cambian con cada movimiento y son pocas por
 * definición, así que valen su propia consulta liviana en vez de engordar la
 * grande.
 */
export async function GET(_req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	// `fetchAll` y no un `select` pelado: PostgREST corta en 1.000 filas sin
	// avisar, y una tarjeta sin marca es indistinguible de una OT al día.
	let rows: { ot_id: string; workflow_step: string }[];
	try {
		({ rows } = await fetchAll<{ ot_id: string; workflow_step: string }>((from, to) =>
			supabaseAdmin
				.from('ot_stage_reports')
				.select('ot_id, workflow_step')
				.is('hours', null)
				.order('created_at', { ascending: true })
				.range(from, to),
		));
	} catch (err) {
		console.error('Error fetching open passes:', err);
		return NextResponse.json({ error: 'No se pudieron cargar las pasadas abiertas' }, { status: 500 });
	}

	// Una etapa aparece UNA vez por OT aunque tenga dos pasadas abiertas: un
	// avance parcial deja dos pasadas por el mismo troquel, y lo accionable es
	// «cerrá el troquelado», no cuántas veces se pasó por él.
	const porOT: Record<string, string[]> = {};
	for (const r of rows) {
		const etapas = (porOT[r.ot_id] ??= []);
		if (!etapas.includes(r.workflow_step)) etapas.push(r.workflow_step);
	}

	return NextResponse.json(porOT);
}
