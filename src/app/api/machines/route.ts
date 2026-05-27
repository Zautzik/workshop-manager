import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { unstable_cache, revalidateTag } from 'next/cache';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { MACHINE_STATUS_VALUES } from '@/types/machine-status';
import { MACHINE_TYPE_VALUES } from '@/types/machine-type';

// ── Segment config ──────────────────────────────────────────────────────────
// The route handler must be dynamic so auth runs per-request.
// The DB query itself is cached separately via unstable_cache below.
export const dynamic = 'force-dynamic';

const nullableString = z.string().max(5000).nullable().optional();
const nullableNumber = z.number().nullable().optional();

// Mirrors UpdateMachineSchema in [id]/route.ts but with name + type required.
// All optional fields are the same so a single MachineUpsert payload works for
// both create (POST) and update (PATCH) without any client-side transformation.
const CreateMachineSchema = z.object({
	name: z.string().min(1).max(255),
	type: z.enum(MACHINE_TYPE_VALUES),
	status: z.enum(MACHINE_STATUS_VALUES).optional(),
	brand: nullableString,
	model: nullableString,
	serial_number: nullableString,
	year_manufactured: nullableNumber,
	location: nullableString,
	description: nullableString,
	photo_url: nullableString,
	nominal_speed_sheets_hr: nullableNumber,
	optimal_speed_sheets_hr: nullableNumber,
	max_print_width_mm: nullableNumber,
	max_print_height_mm: nullableNumber,
	colors: nullableNumber,
	power_kw: nullableNumber,
	energy_cost_per_hr: nullableNumber,
	maintenance_cost_monthly: nullableNumber,
	depreciation_monthly: nullableNumber,
	is_active: z.boolean().optional(),
	workstation_id: z.string().uuid().nullable().optional(),
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
					...parsed.data,
					status: parsed.data.status ?? 'idle',
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
		revalidateTag('machines', 'max');

		return NextResponse.json(data, { status: 201 });
	} catch (error) {
		console.error('Error creating machine:', error);
		return NextResponse.json({ error: 'Failed to create machine' }, { status: 500 });
	}
}
