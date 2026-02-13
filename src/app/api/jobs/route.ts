import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const CreateJobSchema = z.object({
	description: z.string().min(1).max(1000),
	assignedMachineId: z.string().uuid().optional().nullable(),
	status: z.enum(['pending', 'in_progress', 'completed', 'delivered']).optional(),
});

export async function GET(_req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { data, error } = await supabaseAdmin
			.from('jobs')
			.select('*')
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Error fetching jobs:', error);
			return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
		}

		return NextResponse.json(data ?? []);
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
