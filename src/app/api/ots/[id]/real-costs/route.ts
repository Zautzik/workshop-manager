import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { buildRateLimitActor, enforceRouteRateLimit } from '@/lib/api-rate-limit';

const RealCostSchema = z.object({
	operation_code: z.string().min(1).max(50),
	description: z.string().min(1).max(500),
	category: z.enum(['materiales', 'impresion', 'terminaciones', 'tercerizado', 'otros']).default('otros'),
	quantity: z.coerce.number().min(0),
	unit: z.string().max(50).default('unit'),
	unit_cost: z.coerce.number().min(0),
	notes: z.string().max(2000).optional().nullable(),
});

const BulkRealCostsSchema = z.object({
	workflow_step: z.string().min(1).max(100),
	costs: z.array(RealCostSchema).min(1),
});

/**
 * GET /api/ots/[id]/real-costs — Fetch all real costs for an OT
 */
export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { id } = await params;

	if (!id || !z.string().uuid().safeParse(id).success) {
		return NextResponse.json({ error: 'Valid OT id required' }, { status: 400 });
	}

	try {
		const { data, error } = await supabaseAdmin
			.from('ot_real_costs')
			.select('*')
			.eq('ot_id', id)
			.order('workflow_step')
			.order('operation_code');

		if (error) {
			console.error('Error fetching real costs:', error);
			return NextResponse.json({ error: 'Failed to fetch real costs' }, { status: 500 });
		}

		return NextResponse.json(data ?? []);
	} catch (error) {
		console.error('Error fetching real costs:', error);
		return NextResponse.json({ error: 'Failed to fetch real costs' }, { status: 500 });
	}
}

/**
 * POST /api/ots/[id]/real-costs — Record real costs for a workflow step
 */
export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const auth = await requireAuth(['supervisor', 'admin', 'manager']);
	if (isAuthError(auth)) return auth;

	const rl = enforceRouteRateLimit({
		req,
		key: `ots:${buildRateLimitActor(req, auth.id)}:real-costs`,
		limit: 30,
		windowMs: 60_000,
		message: 'Too many OT real-cost submissions. Please wait before retrying.',
	});
	if (rl) return rl;

	const { id } = await params;
	const userId = typeof auth === 'object' && 'id' in auth ? auth.id : null;

	if (!id || !z.string().uuid().safeParse(id).success) {
		return NextResponse.json({ error: 'Valid OT id required' }, { status: 400 });
	}

	try {
		const body = await req.json();
		const parsed = BulkRealCostsSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const { workflow_step, costs } = parsed.data;

		// Replace = insert-first, then delete the previous rows. The old order
		// (delete → insert) lost the step's existing costs whenever the insert
		// failed (2026-07 audit). Now a failed insert leaves the old rows intact;
		// the worst case of a failed cleanup is visible duplicates, not loss.
		const { data: previousRows } = await supabaseAdmin
			.from('ot_real_costs')
			.select('id')
			.eq('ot_id', id)
			.eq('workflow_step', workflow_step);
		const previousIds = (previousRows ?? []).map((r) => r.id);

		const rows = costs.map((c) => ({
			ot_id: id,
			workflow_step,
			operation_code: c.operation_code,
			description: c.description,
			category: c.category,
			quantity: c.quantity,
			unit: c.unit,
			unit_cost: c.unit_cost,
			recorded_by: userId,
			notes: c.notes || null,
		}));

		const { data, error } = await supabaseAdmin
			.from('ot_real_costs')
			.insert(rows)
			.select('*');

		if (error) {
			console.error('Error inserting real costs:', error);
			return NextResponse.json({ error: 'Failed to record real costs' }, { status: 500 });
		}

		if (previousIds.length > 0) {
			const { error: cleanupError } = await supabaseAdmin
				.from('ot_real_costs')
				.delete()
				.in('id', previousIds);
			if (cleanupError) {
				// New rows are in; old ones linger visibly. Log loud, don't fail the request.
				console.error('Error removing replaced real costs (duplicates remain):', cleanupError);
			}
		}

		return NextResponse.json(data, { status: 201 });
	} catch (error) {
		console.error('Error recording real costs:', error);
		return NextResponse.json({ error: 'Failed to record real costs' }, { status: 500 });
	}
}
