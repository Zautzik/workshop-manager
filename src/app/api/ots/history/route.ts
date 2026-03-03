import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

/**
 * GET /api/ots/history?client=name&product_type=etiqueta
 * Returns up to 10 recent OTs matching the filters for cost comparison.
 */
export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { searchParams } = new URL(req.url);
	const client = searchParams.get('client')?.trim();
	const productType = searchParams.get('product_type')?.trim();

	try {
		let query = supabaseAdmin
			.from('ots')
			.select('id, ot_number, client_name, product_name, product_type, quantity, subtotal, total_price, unit_price, created_at')
			.order('created_at', { ascending: false })
			.limit(10);

		if (client) {
			query = query.ilike('client_name', `%${client}%`);
		}
		if (productType) {
			query = query.eq('product_type', productType);
		}

		const { data, error } = await query;

		if (error) {
			console.error('Error fetching OT history:', error);
			return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
		}

		return NextResponse.json(data ?? []);
	} catch (error) {
		console.error('Error fetching OT history:', error);
		return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
	}
}
