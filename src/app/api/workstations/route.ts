import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

// Workstations are reference data — cache with machines cache tag so both
// flush together when machines are written.
export const dynamic = 'force-dynamic';

const fetchWorkstations = unstable_cache(
	async () => {
		const { data, error } = await supabaseAdmin
			.from('workstations')
			.select('*')
			.order('name', { ascending: true });

		if (error) throw new Error(error.message);
		return data ?? [];
	},
	['workstations-list'],
	{ tags: ['workstations', 'machines'], revalidate: 300 },
);

export async function GET(_req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const data = await fetchWorkstations();
		return NextResponse.json(data);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
