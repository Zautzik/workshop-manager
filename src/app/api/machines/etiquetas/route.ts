import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Las máquinas activas CON su token de etiqueta, para imprimir la hoja de QR.
 *
 * Es el único lugar de la aplicación que entrega `machines.qr_token`, y por eso
 * está separado de `GET /api/machines`.
 *
 * Ese endpoint corre con un `requireAuth()` sin lista de roles —cualquier
 * usuario con sesión— y hace `select('*')`, así que si el token saliera por ahí,
 * cualquiera con cuenta se llevaría las credenciales de todas las etiquetas. Es
 * el mismo error que tenía `/api/workers` devolviendo `badge_code` con `*`. Allá
 * se quita el campo de la respuesta; acá se entrega, pero sólo a quien imprime
 * etiquetas.
 *
 * El token abre, sin sesión, la pantalla de mantenciones pendientes de UNA
 * máquina (`/m/<token>`), donde se puede arrancar, marcar y cerrar órdenes. O
 * sea que la lista que devuelve esta ruta es la lista de llaves del taller:
 * administración y supervisión, nadie más.
 *
 * Se devuelven sólo las activas: imprimir la etiqueta de una máquina dada de
 * baja es papel perdido, y una etiqueta pegada en un equipo que ya no está es
 * una llave suelta.
 */
export async function GET(_req: NextRequest) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor']);
	if (isAuthError(auth)) return auth;

	const { data, error } = await supabaseAdmin
		.from('machines' as never)
		// Columnas explícitas: la hoja necesita el nombre, el tipo, la unidad y el
		// token. Nada más entra en una etiqueta.
		.select('id, name, type, usage_unit, is_active, qr_token' as never)
		.eq('is_active' as never, true as never)
		.order('name', { ascending: true });

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ data: data ?? [] });
}
