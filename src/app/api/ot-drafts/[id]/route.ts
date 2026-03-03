import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

// GET /api/ot-drafts/[id] — load a specific draft
export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { id } = await params;
	const userId = typeof auth === 'object' && 'id' in auth ? auth.id : null;

	try {
		const { data, error } = await supabaseAdmin
			.from('ot_drafts')
			.select('*')
			.eq('id', id)
			.eq('user_id', userId!)
			.single();

		if (error || !data) {
			return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
		}

		return NextResponse.json(data);
	} catch (error) {
		console.error('Error fetching draft:', error);
		return NextResponse.json({ error: 'Failed to fetch draft' }, { status: 500 });
	}
}

// DELETE /api/ot-drafts/[id]
export async function DELETE(
	_req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { id } = await params;
	const userId = typeof auth === 'object' && 'id' in auth ? auth.id : null;

	try {
		const { error } = await supabaseAdmin
			.from('ot_drafts')
			.delete()
			.eq('id', id)
			.eq('user_id', userId!);

		if (error) {
			console.error('Error deleting draft:', error);
			return NextResponse.json({ error: 'Failed to delete draft' }, { status: 500 });
		}

		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error('Error deleting draft:', error);
		return NextResponse.json({ error: 'Failed to delete draft' }, { status: 500 });
	}
}
