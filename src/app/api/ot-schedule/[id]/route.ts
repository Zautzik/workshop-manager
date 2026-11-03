import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { PLAN_STEP_KEYS } from '@/lib/production-route';
import { syncAssignedMachine } from '@/lib/schedule-sync';

const UpdateSlotSchema = z.object({
	machine_id: z.string().uuid().optional(),
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
	plan_step: z.enum(PLAN_STEP_KEYS).optional().nullable(),
});

// PATCH /api/ot-schedule/[id]
export async function PATCH(
	req: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	const { id } = await context.params;
	if (!id || !z.string().uuid().safeParse(id).success) {
		return NextResponse.json({ error: 'Valid slot id required' }, { status: 400 });
	}

	const body = await req.json();
	const parsed = UpdateSlotSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}

	const { data, error } = await supabaseAdmin
		.from('ot_machine_schedule')
		.update({ ...parsed.data, updated_at: new Date().toISOString() })
		.eq('id', id)
		.select('*')
		.single();

	if (error) {
		if (error.code === 'PGRST116') return NextResponse.json({ error: 'Schedule slot not found' }, { status: 404 });
		console.error('Error updating schedule slot:', error);
		return NextResponse.json({ error: 'Failed to update schedule slot' }, { status: 500 });
	}
	if (!data) return NextResponse.json({ error: 'Schedule slot not found' }, { status: 404 });

	// Cambiar de máquina un bloque de impresión cambia la prensa de la OT en
	// toda la app, no sólo en la agenda (`syncAssignedMachine`). Mover un bloque
	// sólo en el tiempo no toca la asignación.
	if (parsed.data.machine_id) {
		const planStep = (data as { plan_step?: string | null }).plan_step ?? null;
		if (planStep) await syncAssignedMachine(data.ot_id, parsed.data.machine_id, planStep);
	}

	return NextResponse.json(data);
}

// DELETE /api/ot-schedule/[id]
export async function DELETE(
	req: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	const { id } = await context.params;
	if (!id || !z.string().uuid().safeParse(id).success) {
		return NextResponse.json({ error: 'Valid slot id required' }, { status: 400 });
	}

	const { error } = await supabaseAdmin
		.from('ot_machine_schedule')
		.delete()
		.eq('id', id);

	if (error) {
		console.error('Error deleting schedule slot:', error);
		return NextResponse.json({ error: 'Failed to delete schedule slot' }, { status: 500 });
	}

	return new NextResponse(null, { status: 204 });
}
