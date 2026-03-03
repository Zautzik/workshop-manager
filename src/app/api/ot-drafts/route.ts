import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export async function GET(_req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const userId = typeof auth === 'object' && 'id' in auth ? auth.id : null;
		if (!userId) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { data, error } = await supabaseAdmin
			.from('ot_drafts')
			.select('id, user_id, title, step, created_at, updated_at')
			.eq('user_id', userId)
			.order('updated_at', { ascending: false })
			.limit(10);

		if (error) {
			console.error('Error fetching drafts:', error);
			return NextResponse.json({ error: 'Failed to fetch drafts' }, { status: 500 });
		}

		return NextResponse.json(data ?? []);
	} catch (error) {
		console.error('Error fetching drafts:', error);
		return NextResponse.json({ error: 'Failed to fetch drafts' }, { status: 500 });
	}
}

export async function POST(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const userId = typeof auth === 'object' && 'id' in auth ? auth.id : null;
		if (!userId) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await req.json();

		const title =
			body.form_data?.client_name && body.form_data?.product_name
				? `${body.form_data.client_name} — ${body.form_data.product_name}`
				: body.form_data?.client_name || body.form_data?.product_name || 'Borrador sin título';

		// Upsert: if draft_id is provided, update; otherwise insert
		if (body.draft_id) {
			const { data, error } = await supabaseAdmin
				.from('ot_drafts')
				.update({
					title,
					form_data: body.form_data,
					step: body.step ?? 0,
				})
				.eq('id', body.draft_id)
				.eq('user_id', userId)
				.select('*')
				.single();

			if (error) {
				console.error('Error updating draft:', error);
				return NextResponse.json({ error: 'Failed to update draft' }, { status: 500 });
			}

			return NextResponse.json(data);
		}

		const { data, error } = await supabaseAdmin
			.from('ot_drafts')
			.insert([{
				user_id: userId,
				title,
				form_data: body.form_data,
				step: body.step ?? 0,
			}])
			.select('*')
			.single();

		if (error) {
			console.error('Error creating draft:', error);
			return NextResponse.json({ error: 'Failed to create draft' }, { status: 500 });
		}

		return NextResponse.json(data, { status: 201 });
	} catch (error) {
		console.error('Error saving draft:', error);
		return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 });
	}
}
