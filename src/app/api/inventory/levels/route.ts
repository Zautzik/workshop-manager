import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Existencias por ítem — la vista `inventory_items_stock_v` completa.
 *
 * `useInventory` y `useInventoryItems` la leían directo desde el navegador. Una
 * vista en Postgres corre con los permisos de quien la creó, así que pasaba por
 * encima de RLS y contestaba: funcionaba, y era legible por cualquiera con la
 * publishable key. Es el agujero que la migración 20261014121000 cierra
 * poniéndole `security_invoker` a las vistas — y por eso esta lectura tenía que
 * mudarse primero, o la pantalla se rompía al aplicar la migración.
 *
 * Mismo camino que ya recorrió `inventory_lots` hacia `/api/inventory/lots`,
 * por la misma razón, documentada en `use-admin-queries.ts`.
 *
 * ── Por qué no se reusa `/api/inventory/stock` ─────────────────────────────
 *
 * Esa ruta existe y lee la misma vista, pero con otra forma: siete columnas,
 * sólo `is_active`, y `limit(50)`. Sirve al buscador de
 * `use-procurement-queries`, que es su único llamador. Las pantallas de
 * administración necesitan la vista entera, así que reusarla habría cambiado en
 * silencio lo que muestran — 50 filas, sólo activos, menos columnas.
 *
 * (Esa ruta además convierte un error de consulta en `[]` y sigue. Es el mismo
 * patrón de silencio que esta sesión vino a sacar; acá el error se devuelve.)
 */
export async function GET(req: NextRequest) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor', 'technician']);
	if (isAuthError(auth)) return auth;

	const { searchParams } = new URL(req.url);
	const soloActivos = searchParams.get('active') === 'true';

	let query = supabaseAdmin
		.from('inventory_items_stock_v')
		.select('*', { count: 'exact' })
		.order('name');

	if (soloActivos) query = query.eq('is_active', true);

	const { data, error, count } = await query;

	if (error) return NextResponse.json({ error: error.message }, { status: 500 });

	return NextResponse.json({ data: data ?? [], total: count ?? 0 });
}
