import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { buildRateLimitActor, enforceRouteRateLimit } from '@/lib/api-rate-limit';

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
	// Se limpia cuando por fin llega el arte (o se marca si los uploads fallaron).
	sin_arte: z.boolean().optional(),
	ot_number: z.string().min(1).max(100).optional(),
	client_name: z.string().min(1).max(255).optional(),
	description: z.string().max(2000).optional().nullable(),
	quantity: z.coerce.number().int().min(0).optional(),
	priority: z.coerce.number().int().min(1).max(10).optional(),
	deadline: DeadlineSchema.optional(),
	// `status` is intentionally NOT updatable here. Every status change must go
	// through POST /api/ots/[id]/transition, which enforces the state machine
	// (role access, forward-only, approval/cost gates), writes ot_status_history
	// and stamps completed_at. This PATCH used to accept `status` and silently
	// bypass all of that (2026-07 audit).
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
	// Production floor tracking
	proceso_actual: z.string().max(500).optional().nullable(),
	assigned_machine_id: z.string().uuid().optional().nullable(),
	current_workstation_id: z.string().uuid().optional().nullable(),
	// Planning flags (Hoja de Producción checkboxes)
	flag_ord: z.boolean().optional(),
	flag_pro: z.boolean().optional(),
	flag_vbp: z.boolean().optional(),
	flag_plan: z.boolean().optional(),
	flag_paper_arrived: z.boolean().optional(),
});

/**
 * Una OT, entera.
 *
 * La ruta existía sólo con `PATCH`: se podía modificar una orden y no leerla.
 * El documento que se le manda al cliente la necesita completa, y armarlo desde
 * la lista significaría que el papel impreso y la pantalla salen de dos
 * consultas distintas — que es como terminan diciendo cosas distintas.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor', 'vendedor']);
	if (isAuthError(auth)) return auth;
	const { id } = await params;

	const { data, error } = await supabaseAdmin.from('ots').select('*').eq('id', id).maybeSingle();

	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	if (!data) return NextResponse.json({ error: 'OT no encontrada' }, { status: 404 });

	return NextResponse.json({ ot: data });
}

export async function PATCH(
	req: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	const rl = enforceRouteRateLimit({
		req,
		key: `ots:${buildRateLimitActor(req, auth.id)}:update`,
		limit: 40,
		windowMs: 60_000,
		message: 'Demasiadas actualizaciones seguidas. Espera un momento y reintenta.',
	});
	if (rl) return rl;

	try {
		const { id } = await context.params;
		if (!id || !z.string().uuid().safeParse(id).success) {
			return NextResponse.json({ error: 'Se requiere un ID de OT válido' }, { status: 400 });
		}

		const body = await req.json();
		const parsed = UpdateOTSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		// Separate operations from OT row fields
		const { operations, ...otFields } = parsed.data;

		const { data, error } = await supabaseAdmin
			.from('ots')
			.update({
				...(otFields as any),
				updated_at: new Date().toISOString(),
			})
			.eq('id', id)
			.select('*')
			.single();

		if (error) {
			if (error.code === 'PGRST116') return NextResponse.json({ error: 'OT no encontrada' }, { status: 404 });
			console.error('Error updating OT:', error);
			return NextResponse.json({ error: 'No se pudo actualizar la OT' }, { status: 500 });
		}
		if (!data) return NextResponse.json({ error: 'OT no encontrada' }, { status: 404 });
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
		return NextResponse.json({ error: 'No se pudo actualizar la OT' }, { status: 500 });
	}
}
