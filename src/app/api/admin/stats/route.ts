import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Los cuatro conteos de la portada de administración.
 *
 * ── Por qué se movió del navegador ─────────────────────────────────────────
 *
 * `useAdminStats` contaba `user_roles`, `employees`, `machines` y `jobs` DIRECTO
 * desde el navegador, con la publishable key. La sonda `check:anon` del
 * 2026-10-16 mostró qué estaba devolviendo en realidad:
 *
 *   user_roles  → 4 de 4   ← LEGIBLE por cualquiera
 *   employees   → 0 de 43
 *   machines    → 0 de 18
 *   jobs        → vacía
 *
 * O sea que la tarjeta mostraba «4 usuarios, 0 trabajadores, 0 máquinas» —
 * tres conteos equivocados y uno que era una filtración. Las tres tablas
 * protegidas devuelven cero porque sus policies cuelgan de `auth.uid()`, que en
 * esta aplicación es siempre NULL (se entra por NextAuth y el cliente nunca
 * obtiene un JWT de Supabase). `user_roles` contestaba porque RLS NO está
 * activo en la base, aunque la migración que la crea dice
 * `ENABLE ROW LEVEL SECURITY`: es deriva entre los archivos y la base.
 *
 * Moverlo acá arregla los tres conteos y cierra la filtración de una vez: el
 * service-role pasa por encima de RLS, y quién puede ver esto lo decide el rol
 * de la sesión.
 *
 * `user_roles` es el mapa de quién es admin. Que fuera legible con la
 * publishable key —que viaja en el bundle, en un repositorio público— le decía a
 * cualquiera a qué cuentas conviene apuntar.
 */
export async function GET(_req: NextRequest) {
	const auth = await requireAuth(['admin', 'manager']);
	if (isAuthError(auth)) return auth;

	// `head: true` + `count: 'exact'`: cuenta en el servidor sin traer filas.
	const [usuarios, trabajadores, maquinas, trabajos] = await Promise.all([
		supabaseAdmin.from('user_roles').select('id', { count: 'exact', head: true }),
		supabaseAdmin.from('employees').select('id', { count: 'exact', head: true }),
		supabaseAdmin.from('machines').select('id', { count: 'exact', head: true }),
		supabaseAdmin.from('jobs').select('id', { count: 'exact', head: true }),
	]);

	// Los errores se leen. Un conteo que falla y se muestra como 0 es la misma
	// mentira silenciosa que este cambio vino a sacar.
	const fallas = [
		usuarios.error && `user_roles: ${usuarios.error.message}`,
		trabajadores.error && `employees: ${trabajadores.error.message}`,
		maquinas.error && `machines: ${maquinas.error.message}`,
		trabajos.error && `jobs: ${trabajos.error.message}`,
	].filter(Boolean);

	if (fallas.length > 0) {
		return NextResponse.json({ error: fallas.join(' · ') }, { status: 500 });
	}

	return NextResponse.json({
		data: {
			totalUsers: usuarios.count ?? 0,
			totalWorkers: trabajadores.count ?? 0,
			totalMachines: maquinas.count ?? 0,
			totalJobs: trabajos.count ?? 0,
		},
	});
}
