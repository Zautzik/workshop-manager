import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

/**
 * GET /api/inventory/stock — get inventory stock levels
 * Returns items with current stock for use in OT operations cross-reference.
 */
export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { searchParams } = new URL(req.url);
	const q = searchParams.get('q')?.trim() || '';

	try {
		// Try the stock view first, then fallback to raw table
		let query = supabaseAdmin
			.from('inventory_items')
			.select('id, name, sku, unit, current_stock, min_stock, category')
			.order('name');

		if (q) {
			query = query.ilike('name', `%${q}%`);
		}

		query = query.limit(50);

		const { data, error } = await query;

		if (error) {
			// The inventory tables may not exist yet — return empty
			console.warn('Inventory query failed (table may not exist):', error.message);
			return NextResponse.json([]);
		}

		return NextResponse.json(data ?? []);
	} catch (error) {
		console.error('Error fetching inventory:', error);
		return NextResponse.json([]);
	}
}
