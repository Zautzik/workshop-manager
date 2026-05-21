import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { unstable_cache, revalidateTag } from 'next/cache';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

// ── Segment config ──────────────────────────────────────────────────────────
// The route handler must be dynamic so auth runs per-request.
// The DB query itself is cached separately via unstable_cache below.
export const dynamic = 'force-dynamic';

const CreateMachineSchema = z.object({
	name: z.string().min(1).max(255),
	type: z.string().min(1).max(100),
	status: z.enum(['idle', 'running', 'maintenance', 'offline']).optional(),
});

// ── Cached DB fetch ─────────────────────────────────────────────────────────
// Machines are reference data: new presses are rare, status changes are
// infrequent. unstable_cache stores the query result in the Next.js data
// cache, keyed by 'machines-list', with:
//   • tags: ['machines']  — lets POST flush the cache immediately on write
//   • revalidate: 300     — background refresh ceiling (5 min) as a safety net
// Auth happens in the handler above; this function has no user-specific data.
const fetchMachines = unstable_cache(
	async () => {
		const { data, error } = await supabaseAdmin
			.from('machines')
			.select('*')
			.order('name', { ascending: true });

		if (error) throw new Error(error.message);
		return data ?? [];
	},
	['machines-list'],
	{ tags: ['machines'], revalidate: 300 },
);

export async function GET(_req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const data = await fetchMachines();
		return NextResponse.json(data);
	} catch (error) {
		console.error('Error fetching machines:', error);
		return NextResponse.json({ error: 'Failed to fetch machines' }, { status: 500 });
	}
}

export async function POST(req: NextRequest) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	try {
		const body = await req.json();
		const parsed = CreateMachineSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const { data, error } = await supabaseAdmin
			.from('machines')
			.insert([
				{
					name: parsed.data.name,
					type: parsed.data.type,
					status: parsed.data.status || 'idle',
				} as any,
			])
			.select('*')
			.single();

		if (error) {
			console.error('Error creating machine:', error);
			return NextResponse.json({ error: 'Failed to create machine' }, { status: 500 });
		}

		// Flush the machines cache so the next GET reflects the new machine
		// without waiting for the 5-minute TTL to expire.
		revalidateTag('machines');

		return NextResponse.json(data, { status: 201 });
	} catch (error) {
		console.error('Error creating machine:', error);
		return NextResponse.json({ error: 'Failed to create machine' }, { status: 500 });
	}
}
