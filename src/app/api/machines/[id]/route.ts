import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const UpdateMachineSchema = z.object({
	name: z.string().min(1).max(255).optional(),
	type: z.string().min(1).max(100).optional(),
	status: z.enum(['idle', 'running', 'maintenance', 'offline']).optional(),
});

const IdParamSchema = z.string().uuid();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { id } = await params;
	if (!IdParamSchema.safeParse(id).success) {
		return NextResponse.json({ error: 'Invalid machine ID' }, { status: 400 });
	}

	try {
		const { data, error } = await supabaseAdmin
			.from('machines')
			.select('*')
			.eq('id', id)
			.single();

		if (error) {
			console.error('Error fetching machine:', error);
			return NextResponse.json({ error: 'Failed to fetch machine' }, { status: 500 });
		}

		if (!data) {
			return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
		}

		return NextResponse.json(data);
	} catch (error) {
		console.error('Error fetching machine:', error);
		return NextResponse.json({ error: 'Failed to fetch machine' }, { status: 500 });
	}
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	const { id } = await params;
	if (!IdParamSchema.safeParse(id).success) {
		return NextResponse.json({ error: 'Invalid machine ID' }, { status: 400 });
	}

	try {
		const body = await req.json();
		const parsed = UpdateMachineSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const { data, error } = await supabaseAdmin
			.from('machines')
			.update(parsed.data as any)
			.eq('id', id)
			.select('*')
			.single();

		if (error) {
			console.error('Error updating machine:', error);
			return NextResponse.json({ error: 'Failed to update machine' }, { status: 500 });
		}

		return NextResponse.json(data);
	} catch (error) {
		console.error('Error updating machine:', error);
		return NextResponse.json({ error: 'Failed to update machine' }, { status: 500 });
	}
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireAuth('admin');
	if (isAuthError(auth)) return auth;

	const { id } = await params;
	if (!IdParamSchema.safeParse(id).success) {
		return NextResponse.json({ error: 'Invalid machine ID' }, { status: 400 });
	}

	try {
		const { error } = await supabaseAdmin
			.from('machines')
			.delete()
			.eq('id', id);

		if (error) {
			console.error('Error deleting machine:', error);
			return NextResponse.json({ error: 'Failed to delete machine' }, { status: 500 });
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Error deleting machine:', error);
		return NextResponse.json({ error: 'Failed to delete machine' }, { status: 500 });
	}
}
