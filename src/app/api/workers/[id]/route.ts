import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const UpdateWorkerSchema = z.object({
	name: z.string().min(1).max(255).optional(),
	department: z.string().min(1).max(100).optional(),
	status: z.enum(['active', 'inactive']).optional(),
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
			.from('workers')
			.update({
				...parsed.data,
				updated_at: new Date().toISOString(),
			})
			.eq('id', id)
			.select('*')
			.single();

		if (error) {
			console.error('Error updating worker:', error);
			return NextResponse.json({ error: 'Failed to update worker' }, { status: 500 });
		}

		return NextResponse.json(data);
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
			.from('workers')
			.delete()
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
