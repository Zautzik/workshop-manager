import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/workstations — la flota, con la forma que Planta espera.
 *
 * El taller tenía dos identidades para el mismo fierro: `workstations`, que es
 * lo que Planta leía, y `machines`, que es lo que lee Equipos. Cada puesto ya
 * apuntaba a una máquina, pero con un nombre propio que la contradecía:
 * "Guillotine 1" era en realidad la Guillotine #2, y "Terminaciones B" era la
 * Alzadora. Un operario asignado por nombre estaba frente a otro equipo.
 *
 * Ahora hay una sola identidad —la máquina— y esta ruta la sirve. Se conserva
 * el nombre de la ruta porque es el vocabulario del piso: en Planta uno se para
 * en un puesto, y ese puesto ES la máquina.
 */
export async function GET(_req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { data, error } = await supabaseAdmin
			.from('machines')
			.select('*')
			.order('name', { ascending: true });

		if (error) throw new Error(error.message);
		return NextResponse.json(data ?? []);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
