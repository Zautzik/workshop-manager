import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export async function GET(request: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { searchParams } = new URL(request.url);
		const department = searchParams.get('department');

		let query = supabaseAdmin.from('worker_stats').select('*');
		if (department && department !== 'all') {
			query = query.eq('department', department);
		}

		const { data, error } = await query.order('efficiency_score', { ascending: false });
		if (error) {
			console.error('Error fetching worker stats:', error);
			return NextResponse.json({ error: 'Failed to fetch worker stats' }, { status: 500 });
		}

		return NextResponse.json(data ?? []);
	} catch (error) {
		console.error('Error fetching worker stats:', error);
		return NextResponse.json({ error: 'Failed to fetch worker stats' }, { status: 500 });
	}
}
