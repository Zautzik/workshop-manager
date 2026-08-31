import { NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/movement-types — la lista completa, para la pestaña de
 * administración Y para el selector de movimientos manuales en Inventario
 * (de ahí que lean admin/manager/supervisor, los mismos roles que pueden
 * registrar un movimiento en POST /api/inventory/transactions).
 *
 * Editar (PATCH /api/admin/movement-types/[code]) es admin-only — ver ese
 * archivo para qué campos son seguros de tocar en vivo y cuáles no.
 */
export async function GET() {
	const auth = await requireAuth(['admin', 'manager', 'supervisor']);
	if (isAuthError(auth)) return auth;

	const { data, error } = await supabaseAdmin
		.from('movement_types')
		.select('code, label, direction, requires_ot, active, sort_order')
		.order('sort_order', { ascending: true });

	if (error) {
		console.error('Error fetching movement types:', error);
		return NextResponse.json({ error: 'No se pudieron cargar los tipos de movimiento' }, { status: 500 });
	}

	return NextResponse.json(data ?? []);
}
