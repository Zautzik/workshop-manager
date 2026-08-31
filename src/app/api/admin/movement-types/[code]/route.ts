import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { MOVEMENT_TYPE_CODE_VALUES, type MovementTypeCode } from '@/types/movement-type-code';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/movement-types/[code] — editar UN tipo de movimiento
 * existente. Admin-only.
 *
 * A propósito, lo que se puede tocar es chico: label, active, requires_ot,
 * sort_order. `direction` y `code` NO están en el schema, ni por omisión —
 * flipear `direction` invertiría el signo de todo movimiento FUTURO de ese
 * tipo contra `inventory_lots.quantity_available` (ver
 * sync_inventory_lot_quantities en 20260901090000_movement_types_como_datos.sql),
 * sin ninguna confirmación que alcance a explicar eso a tiempo. Y `code`
 * sigue acotado por el enum `inventory_tx_type` de Postgres: agregar un tipo
 * GENUINAMENTE nuevo pide un ALTER TYPE, que es una migración, no un PATCH.
 */
const PatchSchema = z.object({
	label: z.string().min(1).max(80).optional(),
	active: z.boolean().optional(),
	requires_ot: z.boolean().optional(),
	sort_order: z.number().int().min(0).max(999).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
	const auth = await requireAuth(['admin']);
	if (isAuthError(auth)) return auth;

	const { code: rawCode } = await params;
	if (!(MOVEMENT_TYPE_CODE_VALUES as readonly string[]).includes(rawCode)) {
		return NextResponse.json({ error: 'Tipo de movimiento desconocido' }, { status: 404 });
	}
	const code = rawCode as MovementTypeCode;

	const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors }, { status: 400 });
	}
	if (Object.keys(parsed.data).length === 0) {
		return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 });
	}

	const { data, error } = await supabaseAdmin
		.from('movement_types')
		.update(parsed.data)
		.eq('code', code)
		.select('code, label, direction, requires_ot, active, sort_order')
		.maybeSingle();

	if (error) {
		console.error('Error updating movement type:', error);
		return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
	}
	if (!data) {
		return NextResponse.json({ error: 'Tipo de movimiento no encontrado' }, { status: 404 });
	}

	return NextResponse.json(data);
}
