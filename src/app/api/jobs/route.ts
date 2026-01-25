import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/integrations/supabase/server';

export async function GET(req: NextRequest) {
	const session = await getServerSession(authOptions);

	if (!session) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { data, error } = await supabaseAdmin
			.from('jobs')
			.select('*')
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Error fetching jobs:', error);
			return NextResponse.json(
				{ error: 'Failed to fetch jobs' },
				{ status: 500 }
			);
		}

		return NextResponse.json(data ?? []);
	} catch (error) {
		console.error('Error fetching jobs:', error);
		return NextResponse.json(
			{ error: 'Failed to fetch jobs' },
			{ status: 500 }
		);
	}
}

export async function POST(req: NextRequest) {
	const session = await getServerSession(authOptions);

	if (
		!session ||
		(session.user.role !== 'supervisor' && session.user.role !== 'admin')
	) {
		return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
	}

	try {
		const body = await req.json();
		const { description, assignedMachineId, status } = body;

		const { data, error } = await supabaseAdmin
			.from('jobs')
			.insert([
				{
					description,
					assigned_machine_id: assignedMachineId || null,
					status: status || 'pending',
					created_by: session.user.id,
				},
			])
			.select('*')
			.single();

		if (error) {
			console.error('Error creating job:', error);
			return NextResponse.json(
				{ error: 'Failed to create job' },
				{ status: 500 }
			);
		}

		return NextResponse.json(data, { status: 201 });
	} catch (error) {
		console.error('Error creating job:', error);
		return NextResponse.json(
			{ error: 'Failed to create job' },
			{ status: 500 }
		);
	}
}
