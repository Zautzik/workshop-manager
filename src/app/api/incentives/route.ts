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

const ListSchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(500).default(200),
	active: z.enum(['true', 'false']).optional(),
});

/**
 * Lista las reglas de incentivo.
 *
 * Acá vivía este comentario: «No hay GET acá: la lectura sigue directo desde el
 * cliente (RLS abierta a cualquier autenticado), como ya la leía
 * IncentivosContent.» Las dos mitades eran falsas, y juntas explican el bug:
 *
 *   · La policy de lectura de `incentive_rules` no está abierta a cualquier
 *     autenticado, es `has_role(auth.uid(), 'supervisor')`.
 *   · Y el cliente del navegador nunca es `authenticated`: esta aplicación
 *     entra por NextAuth y no obtiene un JWT de Supabase, así que su rol es
 *     `anon` y `auth.uid()` es siempre NULL.
 *
 * O sea que esa lectura devolvía cero filas — como `200 []`, no como error — y
 * la pantalla mostraba «no hay incentivos». Que esta tabla además esté vacía
 * hoy es casualidad: tapaba el síntoma. Ver `/api/hr/contracts`, donde la misma
 * causa dejaba los contratos invisibles.
 *
 * El portón es el mismo del POST, por la misma razón que lo eligió.
 */
export async function GET(req: NextRequest) {
	const auth = await requireAuth(['admin', 'hr_manager']);
	if (isAuthError(auth)) return auth;

	const parsed = ListSchema.safeParse(
		Object.fromEntries(new URL(req.url).searchParams)
	);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: 'Parámetros inválidos', details: parsed.error.flatten().fieldErrors },
			{ status: 400 },
		);
	}
	const { page, limit, active } = parsed.data;
	const offset = (page - 1) * limit;

	let query = supabaseAdmin
		.from('incentive_rules')
		.select('*', { count: 'exact' })
		.order('created_at', { ascending: false })
		.range(offset, offset + limit - 1);

	if (active) query = query.eq('is_active', active === 'true');

	const { data, error, count } = await query;
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });

	return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit });
}

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
