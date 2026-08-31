import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { OTStatusSchema } from '@/lib/ot-state-machine';
import type { AppRole } from '@/types/app-role';

export const dynamic = 'force-dynamic';

/**
 * A qué estado puede mover una OT cada rol — la tabla ot_role_transitions,
 * editable desde acá en vez de por SQL.
 *
 * Ver 20260901100000_a_que_estado_mueve_cada_rol.sql y
 * src/lib/transition-rules.ts para la semántica todo-o-nada: PUT reemplaza
 * la tabla ENTERA por lo que mande el cuerpo, porque así es como
 * loadRoleAccess() la lee — un mapa parcial no tiene forma honesta de
 * "guardar sólo lo que cambié" sin arriesgar una fila vieja que ya no
 * debería estar.
 */

const ROLES: readonly AppRole[] = ['admin', 'supervisor', 'manager', 'hr_manager', 'technician', 'vendedor'];

const PutSchema = z.object({
	rows: z.array(
		z.object({
			role: z.enum(ROLES as [AppRole, ...AppRole[]]),
			to_status: OTStatusSchema,
		}),
	),
});

export async function GET() {
	const auth = await requireAuth(['admin']);
	if (isAuthError(auth)) return auth;

	const { data, error } = await supabaseAdmin.from('ot_role_transitions').select('role, to_status');
	if (error) {
		console.error('Error fetching role transitions:', error);
		return NextResponse.json({ error: 'No se pudo cargar la configuración' }, { status: 500 });
	}

	return NextResponse.json({ rows: data ?? [] });
}

export async function PUT(req: NextRequest) {
	const auth = await requireAuth(['admin']);
	if (isAuthError(auth)) return auth;

	const parsed = PutSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
	}

	// Una fila por (role, to_status) — de-duplicada acá para que un doble clic
	// en el navegador no choque contra la PRIMARY KEY.
	const seen = new Set<string>();
	const rows = parsed.data.rows.filter((r) => {
		const key = `${r.role}:${r.to_status}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	// Reemplazo completo, no un diff: borrar todo e insertar lo nuevo es la
	// operación honesta para una tabla que se lee como "todo o nada" — un
	// UPSERT parcial dejaría filas viejas que la UI ya no muestra pero la
	// tabla seguiría concediendo. Vía RPC para que sea una sola transacción
	// (ver replace_role_transitions) en vez de un delete + insert que puede
	// quedar a medias si el segundo paso falla.
	const { data, error } = await supabaseAdmin.rpc('replace_role_transitions' as never, {
		p_rows: rows as never,
	} as never);

	if (error) {
		console.error('Error replacing role transitions:', error);
		return NextResponse.json({ error: 'No se pudo guardar la configuración' }, { status: 500 });
	}

	return NextResponse.json({ rows: data ?? [] });
}
