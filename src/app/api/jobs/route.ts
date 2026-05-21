import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

// Jobs are mutable and auth-gated — never cache at the HTTP layer.
export const dynamic = 'force-dynamic';

const CreateJobSchema = z.object({
	description: z.string().min(1).max(1000),
	assignedMachineId: z.string().uuid().optional().nullable(),
	status: z.enum(['pending', 'in_progress', 'completed', 'delivered']).optional(),
});

// ── Pagination ──────────────────────────────────────────────────────────────
const PageSchema = z.object({
	page:  z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { searchParams } = new URL(req.url);
	const pagination = PageSchema.safeParse(Object.fromEntries(searchParams));
	if (!pagination.success) {
		return NextResponse.json(
			{ error: 'Invalid pagination params', details: pagination.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}
	const { page, limit } = pagination.data;
	const offset = (page - 1) * limit;

	try {
		const { data, error, count } = await supabaseAdmin
			.from('jobs')
			.select('*', { count: 'exact' })
			.order('created_at', { ascending: false })
			.range(offset, offset + limit - 1);

		if (error) {
			console.error('Error fetching jobs:', error);
			return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
		}

		const total = count ?? 0;
		return NextResponse.json({
			data: data ?? [],
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		});
	} catch (error) {
		console.error('Error fetching jobs:', error);
		return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
	}
}

export async function POST(req: NextRequest) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	try {
		const body = await req.json();
		const parsed = CreateJobSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const { data, error } = await supabaseAdmin
			.from('jobs')
			.insert([
				{
					description: parsed.data.description,
					assigned_machine_id: parsed.data.assignedMachineId || null,
					status: parsed.data.status || 'pending',
					created_by: auth.id,
				},
			])
			.select('*')
			.single();

		if (error) {
			console.error('Error creating job:', error);
			return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
		}

		return NextResponse.json(data, { status: 201 });
	} catch (error) {
		console.error('Error creating job:', error);
		return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
	}
}
