import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { analyzeCosts } from '@/lib/cost-analysis';

/**
 * GET /api/ots/[id]/cost-analysis — Full cost analysis comparing budgeted vs real costs
 * Returns data in Gonsa-style "Análisis de Costos" format
 */
export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	// Esta ruta ES margen y costo real, no una ficha con algunos campos de
	// plata mezclados — no hay una forma parcial útil para quien no debe verla,
	// así que la puerta es el rol y no el redactado campo por campo.
	const auth = await requireAuth(['admin', 'manager', 'supervisor']);
	if (isAuthError(auth)) return auth;

	const { id } = await params;

	if (!id || !z.string().guid().safeParse(id).success) {
		return NextResponse.json({ error: 'Valid OT id required' }, { status: 400 });
	}

	try {
		// Fetch OT header
		const { data: ot, error: otErr } = await supabaseAdmin
			.from('ots')
			.select('id, ot_number, client_name, product_name, quantity, status, created_at, total_price')
			.eq('id', id)
			.single();

		if (otErr || !ot) {
			return NextResponse.json({ error: 'OT not found' }, { status: 404 });
		}

		// Fetch budgeted operations
		const { data: operations, error: opsErr } = await supabaseAdmin
			.from('ot_operations')
			.select('id, category, name, unit, quantity, unit_cost, total_cost, sort_order')
			.eq('ot_id', id)
			.order('sort_order');

		if (opsErr) {
			console.error('Error fetching operations:', opsErr);
			return NextResponse.json({ error: 'Failed to fetch operations' }, { status: 500 });
		}

		// Lo real es el libro (ot_cost_lines, kind actual): papel del lote,
		// pasadas, mano de obra de Planta y correcciones. Ver src/lib/cost-analysis.ts.
		const { data: actual, error: acErr } = await supabaseAdmin
			.from('ot_cost_lines')
			.select('category, quantity, unit, total, source, ref_type')
			.eq('ot_id', id)
			.eq('kind', 'actual');

		if (acErr) {
			console.error('Error fetching ledger lines:', acErr);
			return NextResponse.json({ error: 'Failed to fetch real costs' }, { status: 500 });
		}

		const analysis = {
			ot: {
				id: ot.id,
				ot_number: ot.ot_number,
				client_name: ot.client_name,
				product_name: ot.product_name,
				quantity: ot.quantity,
				status: ot.status,
				created_at: ot.created_at,
				budget_amount: ot.total_price ?? 0,
			},
			...analyzeCosts(operations ?? [], (actual ?? []) as never),
		};

		return NextResponse.json(analysis);
	} catch (error) {
		console.error('Error generating cost analysis:', error);
		return NextResponse.json({ error: 'Failed to generate cost analysis' }, { status: 500 });
	}
}
