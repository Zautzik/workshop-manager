import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const OTStatusSchema = z.enum([
	'pre_press',
	'visto_bueno',
	'paper_purchase',
	'in_storage',
	'guillotine_first_cut',
	'offset_printing',
	'die_cutting',
	'guillotine_final_cut',
	'workshop',
	'outsourced',
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

const OTColorModeSchema = z.enum([
	'cmyk', '1_color', '2_color', '3_color', 'cmyk_pantone', 'sin_impresion',
]).optional();

const OTPriorityLevelSchema = z.enum(['baja', 'normal', 'alta', 'urgente']).optional();

const OTOperationCategorySchema = z.enum(['materiales', 'impresion', 'terminaciones', 'tercerizado', 'otros']);

const OTOperationSchema = z.object({
	category: OTOperationCategorySchema,
	name: z.string().min(1).max(255),
	unit: z.string().max(50).default('unit'),
	quantity: z.coerce.number().min(0),
	unit_cost: z.coerce.number().min(0),
	sort_order: z.coerce.number().int().min(0).default(0),
});

const UpdateOTSchema = z.object({
	ot_number: z.string().min(1).max(100).optional(),
	client_name: z.string().min(1).max(255).optional(),
	description: z.string().max(2000).optional().nullable(),
	quantity: z.coerce.number().int().min(0).optional(),
	priority: z.coerce.number().int().min(1).max(10).optional(),
	deadline: DeadlineSchema.optional(),
	status: OTStatusSchema.optional(),
	// Specs
	product_name: z.string().max(500).optional().nullable(),
	product_type: z.string().max(100).optional().nullable(),
	priority_level: OTPriorityLevelSchema,
	width_cm: z.coerce.number().min(0).optional().nullable(),
	height_cm: z.coerce.number().min(0).optional().nullable(),
	substrate_type: z.string().max(100).optional().nullable(),
	grammage_gsm: z.coerce.number().int().min(0).optional().nullable(),
	substrate_brand: z.string().max(255).optional().nullable(),
	substrate_supplier: z.string().max(255).optional().nullable(),
	color_front: OTColorModeSchema,
	color_back: OTColorModeSchema,
	pantone_colors: z.array(z.string()).optional().nullable(),
	// Finishes
	finish_troquelado: z.boolean().optional(),
	finish_plegado: z.boolean().optional(),
	finish_pegado: z.boolean().optional(),
	finish_laminado: z.boolean().optional(),
	finish_barniz: z.boolean().optional(),
	finish_relieve: z.boolean().optional(),
	finish_perforado: z.boolean().optional(),
	finish_hot_stamping: z.boolean().optional(),
	finish_uv_localizado: z.boolean().optional(),
	finish_numeracion: z.boolean().optional(),
	// Calculations
	calc_sheets: z.coerce.number().int().min(0).optional().nullable(),
	calc_substrate_kg: z.coerce.number().min(0).optional().nullable(),
	calc_ink_kg: z.coerce.number().min(0).optional().nullable(),
	calc_plates: z.coerce.number().int().min(0).optional().nullable(),
	calc_print_hours: z.coerce.number().min(0).optional().nullable(),
	calc_finish_hours: z.coerce.number().min(0).optional().nullable(),
	// Pricing
	subtotal: z.coerce.number().min(0).optional(),
	margin_pct: z.coerce.number().min(0).max(100).optional(),
	margin_amount: z.coerce.number().min(0).optional(),
	increment_pct: z.coerce.number().min(0).max(100).optional(),
	increment_amount: z.coerce.number().min(0).optional(),
	commission_pct: z.coerce.number().min(0).max(100).optional(),
	commission_amount: z.coerce.number().min(0).optional(),
	total_price: z.coerce.number().min(0).optional(),
	unit_price: z.coerce.number().min(0).optional(),
	// Operations (replace all)
	operations: z.array(OTOperationSchema).optional(),
	notes: z.string().max(5000).optional().nullable(),
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

		// Separate operations from OT row fields
		const { operations, ...otFields } = parsed.data;

		const { data, error } = await supabaseAdmin
			.from('ots')
			.update({
				...otFields,
				updated_at: new Date().toISOString(),
			})
			.eq('id', id)
			.select('*')
			.single();

		if (error) {
			console.error('Error updating OT:', error);
			return NextResponse.json({ error: 'Failed to update OT' }, { status: 500 });
		}

		// If operations were provided, replace them (delete old, insert new)
		if (operations && operations.length > 0) {
			const { error: delError } = await supabaseAdmin
				.from('ot_operations')
				.delete()
				.eq('ot_id', id);

			if (delError) {
				console.error('Error deleting old operations:', delError);
				// Non-fatal: OT row was updated, operations replacement failed
			} else {
				const opsPayload = operations.map((op, idx) => ({
					ot_id: id,
					category: op.category,
					name: op.name,
					unit: op.unit,
					quantity: op.quantity,
					unit_cost: op.unit_cost,
					sort_order: op.sort_order ?? idx,
				}));

				const { error: insError } = await supabaseAdmin
					.from('ot_operations')
					.insert(opsPayload);

				if (insError) {
					console.error('Error inserting operations:', insError);
				}
			}
		}

		return NextResponse.json(data);
	} catch (error) {
		console.error('Error updating OT:', error);
		return NextResponse.json({ error: 'Failed to update OT' }, { status: 500 });
	}
}
