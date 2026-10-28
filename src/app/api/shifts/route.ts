import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

// Shifts are reference data (rarely change). Cache for 5 minutes.
export const dynamic = 'force-dynamic';

const fetchShifts = unstable_cache(
	async () => {
		const { data, error } = await supabaseAdmin
			.from('shifts')
			.select('*')
			.order('start_time', { ascending: true });

		if (error) throw new Error(error.message);
		// Sólo las DEFINICIONES vigentes (migración 20261027140000): las ~500
		// filas viejas —copias por día e incidente— quedan archivadas para la
		// nómina de lo ya trabajado, no para asignar. Antes de la migración
		// ninguna fila tiene `code` y se devuelve todo, como siempre.
		const rows = (data ?? []) as Array<Record<string, any>>;
		const definitions = rows.filter((s) => s.code && !s.archived_at);
		return definitions.length > 0
			? definitions.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
			: rows;
	},
	['shifts-list'],
	{ tags: ['shifts'], revalidate: 300 },
);

export async function GET(_req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const data = await fetchShifts();
		return NextResponse.json(data);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
