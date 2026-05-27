import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { OTStatusSchema } from '@/lib/ot-state-machine';

// OTs are mutable and auth-gated — never cache at the HTTP layer.
export const dynamic = 'force-dynamic';

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

const OTProductTypeSchema = z.enum([
	'etiqueta', 'caja_display', 'caja_plegadiza', 'volante', 'afiche',
	'brochure', 'carpeta', 'sobre', 'bolsa', 'otro',
]).nullable().optional();

const OTSubstrateTypeSchema = z.enum([
	'cauche', 'bond', 'couche', 'cartulina', 'kraft', 'adhesivo', 'vinilo', 'otro',
]).nullable().optional();

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

const CreateOTSchema = z.object({
	ot_number: z.string().min(1).max(100),
	client_name: z.string().min(1).max(255),
	description: z.string().max(2000).optional().nullable(),
	quantity: z.coerce.number().int().min(0),
	priority: z.coerce.number().int().min(1).max(10).optional().default(1),
	deadline: DeadlineSchema.optional(),
	status: OTStatusSchema.optional(),
	// New professional fields
	product_name: z.string().max(500).optional().nullable(),
	product_type: OTProductTypeSchema,
	priority_level: OTPriorityLevelSchema,
	client_id: z.string().uuid().optional().nullable(),
	template_id: z.string().uuid().optional().nullable(),
	width_cm: z.coerce.number().min(0).optional().nullable(),
	height_cm: z.coerce.number().min(0).optional().nullable(),
	substrate_type: OTSubstrateTypeSchema,
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
	// Operations (child rows)
	operations: z.array(OTOperationSchema).optional(),
	notes: z.string().max(5000).optional().nullable(),
});

// ── Pagination ──────────────────────────────────────────────────────────────
// max:200 prevents full-table fetches; callers that need more should filter
// by status/date on the server rather than fetching everything client-side.
const PageSchema = z.object({
	page:   z.coerce.number().int().min(1).default(1),
	limit:  z.coerce.number().int().min(1).max(200).default(50),
	active: z.string().optional(), // 'true' → filter to in-flight statuses only
});

// Statuses that represent an OT actively moving through the workflow.
// Mirrors activeOTStatuses in use-workflow-queries.ts.
const ACTIVE_OT_STATUSES = [
	'pre_press', 'visto_bueno', 'paper_purchase', 'in_storage',
	'guillotine_first_cut', 'offset_printing', 'die_cutting',
	'guillotine_final_cut', 'workshop', 'outsourced', 'workshop_revision',
	'ready_for_delivery', 'in_delivery',
] as const;

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { searchParams } = new URL(req.url);
	const pagination = PageSchema.safeParse(Object.fromEntries(searchParams));
	if (!pagination.success) {
		return NextResponse.json(
			{ error: 'Invalid pagination params', details: pagination.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}
	const { page, limit, active } = pagination.data;
	const offset = (page - 1) * limit;

	try {
		let query = supabaseAdmin
			.from('ots')
			.select(
				'*, workstation:workstations(*), machine:machines!assigned_machine_id(id,name,brand,model,type,status,location,colors,nominal_speed_sheets_hr,power_kw)',
				{ count: 'exact' }
			)
			.order('priority', { ascending: false })
			.order('created_at', { ascending: false });

		if (active === 'true') {
			query = query.in('status', ACTIVE_OT_STATUSES as unknown as string[]);
		}

		const { data, error, count } = await query.range(offset, offset + limit - 1);

		if (error) {
			console.error('Error fetching OTs:', error);
			return NextResponse.json({ error: 'Failed to fetch OTs' }, { status: 500 });
		}

		const total = count ?? 0;
		return NextResponse.json({
			data: data ?? [],
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		});
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

		const d = parsed.data;
		const operations = d.operations || [];

		// Map priority_level to legacy priority integer for backwards compat
		const priorityMap: Record<string, number> = { baja: 2, normal: 5, alta: 8, urgente: 10 };

		const { data: ot, error: otError } = await supabaseAdmin
			.from('ots')
			.insert([
				{
					ot_number: d.ot_number,
					client_name: d.client_name,
					client_id: d.client_id || null,
					description: d.description || null,
					quantity: d.quantity,
					priority: d.priority ?? priorityMap[d.priority_level || 'normal'] ?? 5,
					deadline: d.deadline || null,
					status: d.status || 'pre_press',
					// New fields
					product_name: d.product_name || null,
					product_type: d.product_type || null,
					priority_level: d.priority_level || 'normal',
					template_id: d.template_id || null,
					width_cm: d.width_cm || null,
					height_cm: d.height_cm || null,
					substrate_type: d.substrate_type || null,
					grammage_gsm: d.grammage_gsm || null,
					substrate_brand: d.substrate_brand || null,
					substrate_supplier: d.substrate_supplier || null,
					color_front: d.color_front || 'cmyk',
					color_back: d.color_back || 'sin_impresion',
					pantone_colors: d.pantone_colors || null,
					finish_troquelado: d.finish_troquelado ?? false,
					finish_plegado: d.finish_plegado ?? false,
					finish_pegado: d.finish_pegado ?? false,
					finish_laminado: d.finish_laminado ?? false,
					finish_barniz: d.finish_barniz ?? false,
					finish_relieve: d.finish_relieve ?? false,
					finish_perforado: d.finish_perforado ?? false,
					finish_hot_stamping: d.finish_hot_stamping ?? false,
					finish_uv_localizado: d.finish_uv_localizado ?? false,
					finish_numeracion: d.finish_numeracion ?? false,
					calc_sheets: d.calc_sheets || null,
					calc_substrate_kg: d.calc_substrate_kg || null,
					calc_ink_kg: d.calc_ink_kg || null,
					calc_plates: d.calc_plates || null,
					calc_print_hours: d.calc_print_hours || null,
					calc_finish_hours: d.calc_finish_hours || null,
					subtotal: d.subtotal || 0,
					margin_pct: d.margin_pct ?? 10,
					margin_amount: d.margin_amount || 0,
					increment_pct: d.increment_pct ?? 10,
					increment_amount: d.increment_amount || 0,
					commission_pct: d.commission_pct ?? 1,
					commission_amount: d.commission_amount || 0,
					total_price: d.total_price || 0,
					unit_price: d.unit_price || 0,
					notes: d.notes || null,
				},
			])
			.select('*')
			.single();

		if (otError) {
			console.error('Error creating OT:', otError);
			return NextResponse.json({ error: 'Failed to create OT' }, { status: 500 });
		}

		// Insert operations if any
		if (operations.length > 0 && ot) {
			const opsPayload = operations.map((op, idx) => ({
				ot_id: ot.id,
				category: op.category,
				name: op.name,
				unit: op.unit,
				quantity: op.quantity,
				unit_cost: op.unit_cost,
				sort_order: op.sort_order ?? idx,
			}));

			const { error: opsError } = await supabaseAdmin
				.from('ot_operations')
				.insert(opsPayload);

			if (opsError) {
				console.error('Error creating OT operations:', opsError);
				// OT was created, operations failed - log but don't fail entirely
			}
		}

		return NextResponse.json(ot, { status: 201 });
	} catch (error) {
		console.error('Error creating OT:', error);
		return NextResponse.json({ error: 'Failed to create OT' }, { status: 500 });
	}
}
