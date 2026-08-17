import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { INCENTIVE_TYPE_VALUES } from '../route';

const nullableString = z.string().max(2000).nullable().optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (yyyy-mm-dd)');

const UpdateIncentiveSchema = z
	.object({
		name: z.string().min(1).max(255).optional(),
		description: nullableString,
		incentive_type: z.enum(INCENTIVE_TYPE_VALUES).optional(),
		amount: z.number().min(0).optional(),
		currency_code: z.string().min(1).max(10).optional(),
		calculation_formula: nullableString,
		is_active: z.boolean().optional(),
		effective_from: isoDate.optional(),
		effective_to: isoDate.nullable().optional(),
	})
	.refine(
		(v) => !v.effective_to || !v.effective_from || v.effective_to >= v.effective_from,
		{ message: 'La fecha de término no puede ser anterior a la de inicio', path: ['effective_to'] },
	);

const IdParamSchema = z.string().uuid();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	// RLS ("Admins and HR managers can manage incentive rules"): admin + hr_manager.
	const auth = await requireAuth(['admin', 'hr_manager']);
	if (isAuthError(auth)) return auth;

	const { id } = await params;
	if (!IdParamSchema.safeParse(id).success) {
		return NextResponse.json({ error: 'Invalid incentive ID' }, { status: 400 });
	}

	const body = await req.json().catch(() => null);
	const parsed = UpdateIncentiveSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
			{ status: 400 },
		);
	}

	const { data, error } = await supabaseAdmin
		.from('incentive_rules')
		.update({ ...parsed.data, updated_at: new Date().toISOString() } as any)
		.eq('id', id)
		.select('*')
		.single();

	if (error) {
		if (error.code === 'PGRST116') return NextResponse.json({ error: 'Incentive rule not found' }, { status: 404 });
		console.error('Error updating incentive rule:', error);
		return NextResponse.json({ error: 'Failed to update incentive rule' }, { status: 500 });
	}
	if (!data) return NextResponse.json({ error: 'Incentive rule not found' }, { status: 404 });

	return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireAuth(['admin', 'hr_manager']);
	if (isAuthError(auth)) return auth;

	const { id } = await params;
	if (!IdParamSchema.safeParse(id).success) {
		return NextResponse.json({ error: 'Invalid incentive ID' }, { status: 400 });
	}

	// Una regla ya otorgada es historial de plata pagada, no un borrador: se
	// desactiva (is_active=false vía PATCH), no se borra. Sólo una regla sin
	// ningún employee_incentives asociado puede eliminarse de verdad — el
	// mismo criterio que ya usa el borrado de ítems de inventario con lotes.
	const { count, error: countError } = await supabaseAdmin
		.from('employee_incentives')
		.select('id', { count: 'exact', head: true })
		.eq('incentive_rule_id', id);

	if (countError) {
		console.error('Error checking incentive awards:', countError);
		return NextResponse.json({ error: 'Failed to check incentive usage' }, { status: 500 });
	}
	if ((count ?? 0) > 0) {
		return NextResponse.json(
			{ error: `No se puede eliminar: tiene ${count} incentivo${count === 1 ? '' : 's'} otorgado${count === 1 ? '' : 's'} a personas. Desactívala en vez de borrarla.` },
			{ status: 409 },
		);
	}

	const { error } = await supabaseAdmin.from('incentive_rules').delete().eq('id', id);
	if (error) {
		console.error('Error deleting incentive rule:', error);
		return NextResponse.json({ error: 'Failed to delete incentive rule' }, { status: 500 });
	}

	return NextResponse.json({ success: true });
}
