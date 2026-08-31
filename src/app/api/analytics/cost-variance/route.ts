import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * El cierre de período automático — ver 20260901130000_cierre_de_periodo_y_desviacion.sql.
 *
 * GET lista las fotos ya calculadas (por pg_cron, si el proyecto lo tiene, o
 * por un POST manual). POST recalcula un período — el mes en curso por
 * default — para cuando pg_cron no está disponible en el plan, o para
 * refrescar el mes actual sin esperar a la corrida de esta noche.
 */

const PostSchema = z.object({
	period_start: z.string().date().optional(),
	period_end: z.string().date().optional(),
});

function currentMonthRange(): { start: string; end: string } {
	const now = new Date();
	const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
	return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export async function GET(req: NextRequest) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor']);
	if (isAuthError(auth)) return auth;

	const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 12, 60);

	const { data, error } = await supabaseAdmin
		.from('cost_variance_snapshots')
		.select('*')
		.order('period_start', { ascending: false })
		.limit(limit);

	if (error) {
		console.error('Error fetching cost variance snapshots:', error);
		return NextResponse.json({ error: 'No se pudieron cargar los cierres de período' }, { status: 500 });
	}

	return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor']);
	if (isAuthError(auth)) return auth;

	const parsed = PostSchema.safeParse(await req.json().catch(() => ({})));
	if (!parsed.success) {
		return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
	}

	const range = currentMonthRange();
	const start = parsed.data.period_start ?? range.start;
	const end = parsed.data.period_end ?? range.end;

	const { data, error } = await supabaseAdmin.rpc('compute_cost_variance_snapshot' as never, {
		p_start: start,
		p_end: end,
	} as never);

	if (error) {
		console.error('Error computing cost variance snapshot:', error);
		return NextResponse.json({ error: 'No se pudo calcular el cierre de período' }, { status: 500 });
	}

	return NextResponse.json(data);
}
