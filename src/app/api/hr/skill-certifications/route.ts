import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Lista las competencias certificadas, con la persona y la habilidad.
 *
 * Misma razón que `/api/hr/contracts`: la pestaña «Certificaciones» de
 * `/personas/talento` leía `employee_skills` directo desde el navegador. Esa
 * tabla tiene policy `auth.uid() IS NOT NULL`, y con NextAuth `auth.uid()` es
 * siempre NULL — o sea cero filas, devueltas como `200 []` y mostradas como
 * «no hay nada» (ver el encabezado de `/api/hr/contracts` para el detalle).
 *
 * El rol acá es más amplio que en contratos a propósito: una competencia no es
 * dato privado de la persona, es lo que decide quién puede operar qué máquina,
 * y un supervisor necesita verla para asignar un turno. Es el mismo conjunto
 * que ya gobierna la escritura en `/api/employees/skills`.
 */
const QuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(500).default(200),
	employee_id: z.string().uuid().optional(),
	certified: z.enum(['true', 'false']).optional(),
});

export async function GET(req: NextRequest) {
	const auth = await requireAuth(['admin', 'supervisor', 'hr_manager']);
	if (isAuthError(auth)) return auth;

	const parsed = QuerySchema.safeParse(
		Object.fromEntries(new URL(req.url).searchParams)
	);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: 'Parámetros inválidos', details: parsed.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}
	const { page, limit, employee_id, certified } = parsed.data;
	const offset = (page - 1) * limit;

	let query = supabaseAdmin
		.from('employee_skills')
		.select('*, employees(full_name, department), skills(name)', { count: 'exact' })
		.order('last_assessed_on', { ascending: false })
		.range(offset, offset + limit - 1);

	if (employee_id) query = query.eq('employee_id', employee_id);
	if (certified) query = query.eq('certified', certified === 'true');

	const { data, error, count } = await query;

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit });
}
