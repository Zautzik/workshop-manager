import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

// Mirrors `incentive_rule_type` in supabase/migrations/20260221143000_hr_domain_core_tables.sql.
export const INCENTIVE_TYPE_VALUES = [
	'fixed_amount',
	'percentage',
	'free_trial',
	'fixed_bonus',
	'performance_bonus',
	'attendance_bonus',
	'overtime_bonus',
	'penalty_adjustment',
] as const;

const nullableString = z.string().max(2000).nullable().optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (yyyy-mm-dd)');

// Mirrors UpdateIncentiveSchema in [id]/route.ts but with `name` required.
export const CreateIncentiveSchema = z
	.object({
		name: z.string().min(1).max(255),
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

// No hay GET acá: la lectura sigue directo desde el cliente (RLS abierta a
// cualquier autenticado), como ya la leía IncentivosContent. Sólo las
// escrituras necesitan pasar por una ruta con requireAuth + Zod.
export async function POST(req: NextRequest) {
	// RLS ("Admins and HR managers can manage incentive rules",
	// 20260224233000_hr_role_permissions.sql): sólo admin y hr_manager escriben.
	const auth = await requireAuth(['admin', 'hr_manager']);
	if (isAuthError(auth)) return auth;

	const body = await req.json().catch(() => null);
	const parsed = CreateIncentiveSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
			{ status: 400 },
		);
	}

	// El default de la columna es 'USD' (plantilla original); este taller
	// cotiza y paga en CLP (fix(dinero) 2026-07-26 barrió los demás defaults en
	// dólares) — nunca se hereda el default de la tabla acá.
	const { currency_code, ...rest } = parsed.data;

	const { data, error } = await supabaseAdmin
		.from('incentive_rules')
		.insert([{ ...rest, currency_code: currency_code ?? 'CLP' } as any])
		.select('*')
		.single();

	if (error) {
		console.error('Error creating incentive rule:', error);
		return NextResponse.json({ error: 'Failed to create incentive rule' }, { status: 500 });
	}

	return NextResponse.json(data, { status: 201 });
}
