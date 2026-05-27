import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

// Shifts are reference data (rarely change). Cache for 5 minutes.
export const dynamic = 'force-dynamic';

const fetchShifts = unstable_cache(
	async () => {
		const { data, error } = await supabaseAdmin
			.from('shifts')
			.select('*')
			.order('start_time', { ascending: true });

		if (error) throw new Error(error.message);
		return data ?? [];
	},
	['shifts-list'],
	{ tags: ['shifts'], revalidate: 300 },
);

export async function GET(_req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const data = await fetchShifts();
		return NextResponse.json(data);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
