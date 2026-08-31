import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const ScheduleSlotSchema = z.object({
	ot_id: z.string().uuid(),
	machine_id: z.string().uuid(),
	scheduled_start: z.string().datetime().optional().nullable(),
	scheduled_end: z.string().datetime().optional().nullable(),
	actual_start: z.string().datetime().optional().nullable(),
	actual_end: z.string().datetime().optional().nullable(),
	estimated_hours: z.coerce.number().min(0).optional().nullable(),
	hours_override: z.coerce.number().min(0).optional().nullable(),
	actual_hours: z.coerce.number().min(0).optional().nullable(),
	sheet_width_cm: z.coerce.number().min(0).optional().nullable(),
	sheet_height_cm: z.coerce.number().min(0).optional().nullable(),
	calc_sheets: z.coerce.number().int().min(0).optional().nullable(),
	paper_type_label: z.string().max(255).optional().nullable(),
	sort_order: z.coerce.number().int().min(0).optional(),
	notes: z.string().max(2000).optional().nullable(),
});

// GET /api/ot-schedule?ot_id=xxx  or  ?machine_id=xxx&date=2026-04-20
export async function GET(req: NextRequest) {
	const auth = await requireAuth(['supervisor', 'admin', 'manager']);
	if (isAuthError(auth)) return auth;

	const { searchParams } = new URL(req.url);
	const otId = searchParams.get('ot_id');
	const machineId = searchParams.get('machine_id');
	const date = searchParams.get('date'); // YYYY-MM-DD

	let query = supabaseAdmin
		.from('ot_machine_schedule')
		.select(`
			*,
			ot:ots(
				id, ot_number, client_name, product_name, description,
				quantity, color_front, color_back, pantone_colors,
				status, deadline, proceso_actual,
				flag_ord, flag_pro, flag_vbp, flag_plan, flag_paper_arrived,
				calc_print_hours, calc_finish_hours,
				finish_troquelado, finish_plegado, finish_pegado, finish_laminado,
				finish_barniz, finish_relieve, finish_perforado, finish_hot_stamping,
				finish_uv_localizado, finish_numeracion
			),
			machine:machines(id, name, type, status)
		`)
		.order('sort_order', { ascending: true })
		.order('scheduled_start', { ascending: true });

	if (otId) {
		query = query.eq('ot_id', otId);
	}
	if (machineId) {
		query = query.eq('machine_id', machineId);
	}
	if (date) {
		// All slots whose scheduled_start falls on the given date
		const dayStart = `${date}T00:00:00.000Z`;
		const dayEnd = `${date}T23:59:59.999Z`;
		query = query
			.gte('scheduled_start', dayStart)
			.lte('scheduled_start', dayEnd);
	}

	const { data, error } = await query;
	if (error) {
		console.error('Error fetching schedule:', error);
		return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 });
	}

	return NextResponse.json(data ?? []);
}

// POST /api/ot-schedule — upsert a slot
export async function POST(req: NextRequest) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	const body = await req.json();
	const parsed = ScheduleSlotSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}

	// If no estimated_hours provided, call the estimation RPC
	let estimated = parsed.data.estimated_hours;
	if (estimated == null) {
		const { data: est } = await supabaseAdmin.rpc('estimate_ot_hours', {
			p_ot_id: parsed.data.ot_id,
			p_machine_type: undefined,
		});
		const estData = est as { error?: string; estimated_hours?: number } | null;
		if (estData && !estData.error) {
			estimated = estData.estimated_hours ?? null;
		}
	}

	const { data, error } = await supabaseAdmin
		.from('ot_machine_schedule')
		.insert({
			...parsed.data,
			estimated_hours: estimated,
		})
		.select('*')
		.single();

	if (error) {
		console.error('Error creating schedule slot:', error);
		return NextResponse.json({ error: 'Failed to create schedule slot' }, { status: 500 });
	}

	// Programar la OT en una máquina Y tenerla "asignada" a esa máquina eran dos
	// hechos separados (`ot_machine_schedule.machine_id` vs
	// `ots.assigned_machine_id`) que podían desincronizarse -- el mismo patrón
	// de "dos puertas para el mismo trabajo" que este repositorio viene
	// cerrando (NOTES.md). La compuerta de Pre-Prensa mira específicamente
	// `assigned_machine_id`, así que programar sin fijarlo dejaba el hueco
	// "máquina asignada" abierto aunque la OT ya tuviera una máquina de verdad
	// (auditoría 2026-08-31). Sólo se fija si estaba vacío: no se pisa una
	// asignación explícita con la de un slot programado después.
	const { error: asignarError } = await supabaseAdmin
		.from('ots')
		.update({ assigned_machine_id: parsed.data.machine_id })
		.eq('id', parsed.data.ot_id)
		.is('assigned_machine_id', null);
	if (asignarError) {
		console.warn('No se pudo fijar assigned_machine_id tras programar:', asignarError.message);
	}

	return NextResponse.json(data, { status: 201 });
}
