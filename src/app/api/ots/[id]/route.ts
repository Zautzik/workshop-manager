import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const OTStatusSchema = z.enum([
	'pre_press',
	'visto_bueno',
	'paper_purchase',
	'paper_received',
	'in_storage',
	'guillotine_first_cut',
	'offset_printing',
	'die_cutting',
	'guillotine_final_cut',
	'workshop_revision',
	'ready_for_delivery',
	'in_delivery',
	'completed',
]);

const DeadlineSchema = z.preprocess((value) => {
	if (value === null || value === undefined || value === '') {
		return null;
	}
	if (typeof value === 'string') {
		const date = new Date(value);
		if (!Number.isNaN(date.getTime())) {
			return date.toISOString();
		}
	}
	return value;
}, z.union([z.string().datetime(), z.null()]));

const UpdateOTSchema = z.object({
	ot_number: z.string().min(1).max(100).optional(),
	client_name: z.string().min(1).max(255).optional(),
	description: z.string().max(2000).optional().nullable(),
	quantity: z.coerce.number().int().min(0).optional(),
	priority: z.coerce.number().int().min(1).max(10).optional(),
	deadline: DeadlineSchema.optional(),
	status: OTStatusSchema.optional(),
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
			return NextResponse.json({ error: 'Valid OT id required' }, { status: 400 });
		}

		const body = await req.json();
		const parsed = UpdateOTSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const { data, error } = await supabaseAdmin
			.from('ots')
			.update({
				...parsed.data,
				updated_at: new Date().toISOString(),
			})
			.eq('id', id)
			.select('*')
			.single();

		if (error) {
			console.error('Error updating OT:', error);
			return NextResponse.json({ error: 'Failed to update OT' }, { status: 500 });
		}

		return NextResponse.json(data);
	} catch (error) {
		console.error('Error updating OT:', error);
		return NextResponse.json({ error: 'Failed to update OT' }, { status: 500 });
	}
}
