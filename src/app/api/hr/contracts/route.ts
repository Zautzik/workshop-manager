import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, hasRole, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Lista los contratos de trabajo, con el nombre y el área de cada persona.
 *
 * ── Por qué esta ruta existe ───────────────────────────────────────────────
 *
 * La pestaña «Contratos» de `/personas/consola` leía `employment_contracts`
 * DIRECTO desde el navegador, con la publishable key. Esa key es el rol `anon`,
 * y la policy de lectura de esa tabla cuelga de
 * `can_supervisor_view_employee(auth.uid(), …)`. En esta aplicación se entra
 * por NextAuth y el cliente del navegador nunca obtiene un JWT de Supabase, así
 * que `auth.uid()` es SIEMPRE NULL: la policy daba falso para todas las filas.
 *
 * PostgREST contesta eso con `200 []`, no con un error — así que el `if (error)
 * throw error` del hook nunca se disparaba y la pantalla mostraba «no hay
 * contratos» con total convicción. Confirmado en vivo el 2026-10-14: la tabla
 * tenía 38 contratos y la pestaña aparecía vacía, mientras la de «Equipo» de la
 * misma pantalla —que sí pasa por una ruta de API— mostraba a la gente.
 *
 * Por eso la lectura vive acá: el service-role pasa por encima de RLS, y quién
 * puede ver qué lo decide el rol de la sesión, que es lo que esta aplicación
 * realmente sabe. Mismo criterio que `PATCH /api/employees/[id]/compensation`
 * y `GET /api/employees/[id]/contract` ya aplican: un contrato trae jornada,
 * topes de horas y condiciones, así que administración y RRHH.
 */
const PageSchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(500).default(200),
	employee_id: z.string().uuid().optional(),
	active: z.enum(['true', 'false']).optional(),
});

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	// El mismo portón que la escritura de contratos y de remuneración.
	if (!hasRole(auth.role, ['admin', 'hr_manager'])) {
		return NextResponse.json(
			{ error: 'Solo administración o RRHH puede ver los contratos' },
			{ status: 403 }
		);
	}

	const parsed = PageSchema.safeParse(
		Object.fromEntries(new URL(req.url).searchParams)
	);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: 'Parámetros inválidos', details: parsed.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}
	const { page, limit, employee_id, active } = parsed.data;
	const offset = (page - 1) * limit;

	let query = supabaseAdmin
		.from('employment_contracts')
		.select('*, employees(full_name, department)', { count: 'exact' })
		.order('start_date', { ascending: false })
		.range(offset, offset + limit - 1);

	if (employee_id) query = query.eq('employee_id', employee_id);
	if (active) query = query.eq('is_active', active === 'true');

	const { data, error, count } = await query;

	// El error se lee y se devuelve. Que una consulta fallada se vea igual que
	// «no hay nada» es justo lo que escondió este bug durante meses.
	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit });
}
