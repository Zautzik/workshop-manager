import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { OPERATION_MONEY_FIELDS, redactMoney } from '@/lib/money-fields';

/**
 * GET /api/ots/[id]/operations — Fetch all operations for an OT
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
			.from('ot_operations')
			.select('*')
			.eq('ot_id', id)
			.order('sort_order', { ascending: true });

		if (error) {
			console.error('Error fetching OT operations:', error);
			return NextResponse.json({ error: 'Failed to fetch operations' }, { status: 500 });
		}

		return NextResponse.json(redactMoney(data ?? [], auth.role, OPERATION_MONEY_FIELDS));
	} catch (error) {
		console.error('Error fetching OT operations:', error);
		return NextResponse.json({ error: 'Failed to fetch operations' }, { status: 500 });
	}
}
