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

const CreateOTSchema = z.object({
	ot_number: z.string().min(1).max(100),
	client_name: z.string().min(1).max(255),
	description: z.string().max(2000).optional().nullable(),
	quantity: z.coerce.number().int().min(0),
	priority: z.coerce.number().int().min(1).max(10),
	deadline: DeadlineSchema.optional(),
	status: OTStatusSchema.optional(),
});

export async function GET(_req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { data, error } = await supabaseAdmin
			.from('ots')
			.select('*, workstation:workstations(*)')
			.order('priority', { ascending: false })
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Error fetching OTs:', error);
			return NextResponse.json({ error: 'Failed to fetch OTs' }, { status: 500 });
		}

		return NextResponse.json(data ?? []);
	} catch (error) {
		console.error('Error fetching OTs:', error);
		return NextResponse.json({ error: 'Failed to fetch OTs' }, { status: 500 });
	}
}

export async function POST(req: NextRequest) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	try {
		const body = await req.json();
		const parsed = CreateOTSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const { data, error } = await supabaseAdmin
			.from('ots')
			.insert([
				{
					ot_number: parsed.data.ot_number,
					client_name: parsed.data.client_name,
					description: parsed.data.description || null,
					quantity: parsed.data.quantity,
					priority: parsed.data.priority,
					deadline: parsed.data.deadline || null,
					status: parsed.data.status || 'pre_press',
					created_by: auth.id,
				},
			])
			.select('*')
			.single();

		if (error) {
			console.error('Error creating OT:', error);
			return NextResponse.json({ error: 'Failed to create OT' }, { status: 500 });
		}

		return NextResponse.json(data, { status: 201 });
	} catch (error) {
		console.error('Error creating OT:', error);
		return NextResponse.json({ error: 'Failed to create OT' }, { status: 500 });
	}
}
