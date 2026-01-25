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
			.from('machines')
			.select('*')
			.order('name', { ascending: true });

		if (error) {
			console.error('Error fetching machines:', error);
			return NextResponse.json(
				{ error: 'Failed to fetch machines' },
				{ status: 500 }
			);
		}

		return NextResponse.json(data ?? []);
	} catch (error) {
		console.error('Error fetching machines:', error);
		return NextResponse.json(
			{ error: 'Failed to fetch machines' },
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
		const { name, type, status } = body;

		const { data, error } = await supabaseAdmin
			.from('machines')
			.insert([
				{
					name,
					type,
					status: status || 'idle',
				},
			])
			.select('*')
			.single();

		if (error) {
			console.error('Error creating machine:', error);
			return NextResponse.json(
				{ error: 'Failed to create machine' },
				{ status: 500 }
			);
		}

		return NextResponse.json(data, { status: 201 });
	} catch (error) {
		console.error('Error creating machine:', error);
		return NextResponse.json(
			{ error: 'Failed to create machine' },
			{ status: 500 }
		);
	}
}
