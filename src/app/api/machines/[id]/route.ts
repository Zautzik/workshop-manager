import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/integrations/supabase/server';

export async function GET(req: NextRequest, { params }: { params: any }) {
	const session = await getServerSession(authOptions);

	if (!session) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { data, error } = await supabaseAdmin
			.from('machines')
			.select('*')
			.eq('id', params.id)
			.single();

		if (error) {
			console.error('Error fetching machine:', error);
			return NextResponse.json(
				{ error: 'Failed to fetch machine' },
				{ status: 500 }
			);
		}

		if (!data) {
			return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
		}

		return NextResponse.json(data);
	} catch (error) {
		console.error('Error fetching machine:', error);
		return NextResponse.json(
			{ error: 'Failed to fetch machine' },
			{ status: 500 }
		);
	}
}

export async function PATCH(req: NextRequest, { params }: { params: any }) {
	const session = await getServerSession(authOptions);

	if (
		!session ||
		(session.user.role !== 'supervisor' && session.user.role !== 'admin')
	) {
		return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
	}

	try {
		const body = await req.json();

		const { data, error } = await supabaseAdmin
			.from('machines')
			.update(body)
			.eq('id', params.id)
			.select('*')
			.single();

		if (error) {
			console.error('Error updating machine:', error);
			return NextResponse.json(
				{ error: 'Failed to update machine' },
				{ status: 500 }
			);
		}

		return NextResponse.json(data);
	} catch (error) {
		console.error('Error updating machine:', error);
		return NextResponse.json(
			{ error: 'Failed to update machine' },
			{ status: 500 }
		);
	}
}

export async function DELETE(req: NextRequest, { params }: { params: any }) {
	const session = await getServerSession(authOptions);

	if (!session || session.user.role !== 'admin') {
		return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
	}

	try {
		const { error } = await supabaseAdmin
			.from('machines')
			.delete()
			.eq('id', params.id);

		if (error) {
			console.error('Error deleting machine:', error);
			return NextResponse.json(
				{ error: 'Failed to delete machine' },
				{ status: 500 }
			);
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Error deleting machine:', error);
		return NextResponse.json(
			{ error: 'Failed to delete machine' },
			{ status: 500 }
		);
	}
}
