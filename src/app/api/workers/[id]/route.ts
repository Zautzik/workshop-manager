import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const UpdateWorkerSchema = z.object({
	name: z.string().min(1).max(255).optional(),
	department: z.string().min(1).max(100).optional(),
	status: z.enum(['active', 'inactive', 'on_leave', 'terminated']).optional(),
});

export async function PATCH(
	req: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	try {
		const { id } = await context.params;
		if (!id || !z.string().uuid().safeParse(id).success) {
			return NextResponse.json({ error: 'Valid worker id required' }, { status: 400 });
		}

		const body = await req.json();
		const parsed = UpdateWorkerSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const { data, error } = await supabaseAdmin
			.from('employees')
			.update({
				...(parsed.data.name ? { full_name: parsed.data.name } : {}),
				...(parsed.data.department ? { department: parsed.data.department } : {}),
				...(parsed.data.status ? { status: parsed.data.status } : {}),
			})
			.eq('id', id)
			.select('id, full_name, department, status')
			.single();

		if (error) {
			if (error.code === 'PGRST116') return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
			console.error('Error updating worker:', error);
			return NextResponse.json({ error: 'Failed to update worker' }, { status: 500 });
		}
		if (!data) return NextResponse.json({ error: 'Worker not found' }, { status: 404 });

		return NextResponse.json({
			...data,
			name: data.full_name,
		});
	} catch (error) {
		console.error('Error updating worker:', error);
		return NextResponse.json({ error: 'Failed to update worker' }, { status: 500 });
	}
}

export async function DELETE(
	_req: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	try {
		const { id } = await context.params;
		if (!id || !z.string().uuid().safeParse(id).success) {
			return NextResponse.json({ error: 'Valid worker id required' }, { status: 400 });
		}

		const { error } = await supabaseAdmin
			.from('employees')
			.update({ status: 'inactive' })
			.eq('id', id);

		if (error) {
			console.error('Error deleting worker:', error);
			return NextResponse.json({ error: 'Failed to delete worker' }, { status: 500 });
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Error deleting worker:', error);
		return NextResponse.json({ error: 'Failed to delete worker' }, { status: 500 });
	}
}
