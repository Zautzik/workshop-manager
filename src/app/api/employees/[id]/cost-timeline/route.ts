import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, hasRole, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Read a person's cost timeline — hours, pay, premiums and incentives by period.
 *
 * This route exists because the browser used to call the RPC directly.
 * `get_employee_cost_timeline` is SECURITY DEFINER (so it reads straight past
 * RLS) and nobody ever revoked Postgres' default `EXECUTE … TO PUBLIC`, which
 * means the publishable key in the client bundle could ask for any employee's
 * remuneration by UUID. `use-financial-queries.ts` was calling it as `anon`
 * and it worked for exactly that reason.
 *
 * Migration 20261014122000 revokes that grant. The data is still needed, so it
 * comes through here instead: service-role calls the function, and the gate is
 * the same one `PATCH /api/employees/[id]/compensation` already uses for wages.
 * Read and write now agree about who may see a salary.
 */
const QuerySchema = z.object({
	start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha desde inválida (YYYY-MM-DD)'),
	end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha hasta inválida (YYYY-MM-DD)'),
	granularity: z.enum(['week', 'month']).default('month'),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	// Wages are sensitive: the same gate the write side uses.
	if (!hasRole(auth.role, ['admin', 'hr_manager'])) {
		return NextResponse.json(
			{ error: 'Solo administración o RRHH puede ver el costo de una persona' },
			{ status: 403 }
		);
	}

	const { id } = await params;
	if (!id || !z.string().uuid().safeParse(id).success) {
		return NextResponse.json({ error: 'Se requiere un ID de empleado válido' }, { status: 400 });
	}

	const { searchParams } = new URL(req.url);
	const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: 'Parámetros inválidos', details: parsed.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}
	const { start, end, granularity } = parsed.data;

	if (start > end) {
		return NextResponse.json(
			{ error: 'La fecha desde no puede ser posterior a la fecha hasta' },
			{ status: 400 }
		);
	}

	const { data, error } = await supabaseAdmin.rpc('get_employee_cost_timeline' as any, {
		p_employee_id: id,
		p_start_date: start,
		p_end_date: end,
		p_granularity: granularity,
	} as any);

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ data: data ?? [] });
}
