import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { fetchAll } from '@/lib/fetch-all';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics/resumen?from=&to=&cmp_from=&cmp_to= — el Resumen de
 * Analítica en una sola respuesta.
 *
 * Antes la pantalla calculaba todo EN EL NAVEGADOR sobre `useOTs()`, que trae
 * 200 OT: con 250 en la base, lo vendido y las entregas a tiempo eran una
 * parte sin aviso. La puntualidad usaba `updated_at` como fecha de entrega
 * (cualquier edición posterior la movía) teniendo `completed_at` al lado. Acá
 * se pagina hasta agotar y se usa la fecha real de término (2026-11-25).
 *
 * Lo que NO está: "eficiencia del personal". Salía de quality_score /
 * speed_score con 75 de relleno, columnas que nada escribe (ver el comentario
 * de 'Rendimiento' en navigation.ts). Un promedio de rellenos no es un dato.
 */

type Ot = {
	id: string;
	ot_number: string | null;
	client_name: string | null;
	status: string;
	total_price: number | null;
	deadline: string | null;
	created_at: string;
	completed_at: string | null;
};

const DAY = 86_400_000;

const parseDate = (s: string | null) => {
	if (!s) return null;
	const d = new Date(s);
	return Number.isNaN(d.getTime()) ? null : d;
};

const within = (iso: string | null, from: Date | null, to: Date | null) => {
	if (!iso || !from || !to) return false;
	const t = new Date(iso).getTime();
	return t >= from.getTime() && t <= to.getTime();
};

export async function GET(req: NextRequest) {
	const auth = await requireAuth(['admin', 'manager']);
	if (isAuthError(auth)) return auth;

	const sp = new URL(req.url).searchParams;
	const from = parseDate(sp.get('from'));
	const to = parseDate(sp.get('to'));
	const cmpFrom = parseDate(sp.get('cmp_from'));
	const cmpTo = parseDate(sp.get('cmp_to'));

	let ots: Ot[];
	let truncated: boolean;
	try {
		const r = await fetchAll<Ot>((a, b) =>
			supabaseAdmin
				.from('ots')
				.select('id, ot_number, client_name, status, total_price, deadline, created_at, completed_at')
				.order('created_at', { ascending: true })
				.range(a, b) as any,
		);
		ots = r.rows;
		truncated = r.truncated;
	} catch (err) {
		return NextResponse.json(
			{ error: `No se pudieron leer las OT: ${err instanceof Error ? err.message : 'error desconocido'}` },
			{ status: 500 },
		);
	}

	const [machinesRes, maintRes] = await Promise.all([
		supabaseAdmin.from('machines').select('status'),
		supabaseAdmin.from('maintenance_work_orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
	]);

	const now = Date.now();
	const active = ots.filter((o) => o.status !== 'completed');

	// ── Lo vendido: precio de las OT creadas en la ventana ──────────────────
	const sold = (f: Date | null, t: Date | null) =>
		ots.filter((o) => within(o.created_at, f, t)).reduce((s, o) => s + Number(o.total_price ?? 0), 0);
	const soldCount = (f: Date | null, t: Date | null) => ots.filter((o) => within(o.created_at, f, t)).length;

	// Últimos 6 meses calendario, para la tendencia del tile.
	const months: { month: string; total: number }[] = [];
	const ref = new Date();
	for (let i = 5; i >= 0; i--) {
		const m0 = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
		const m1 = new Date(ref.getFullYear(), ref.getMonth() - i + 1, 1);
		months.push({
			month: `${m0.getFullYear()}-${String(m0.getMonth() + 1).padStart(2, '0')}`,
			total: Math.round(sold(m0, new Date(m1.getTime() - 1))),
		});
	}

	// ── Puntualidad: OT terminadas en la ventana, término ≤ plazo ───────────
	const onTime = (f: Date | null, t: Date | null) => {
		const done = ots.filter((o) => o.completed_at && o.deadline && within(o.completed_at, f, t));
		if (done.length === 0) return { pct: null as number | null, done: 0 };
		const ok = done.filter((o) => new Date(o.completed_at!).getTime() <= new Date(o.deadline!).getTime()).length;
		return { pct: Math.round((ok / done.length) * 1000) / 10, done: done.length };
	};

	// ── Plazos de lo que está en curso ──────────────────────────────────────
	const withDeadline = active
		.filter((o) => o.deadline)
		.map((o) => ({
			ot_id: o.id,
			ot_number: o.ot_number,
			client_name: o.client_name,
			status: o.status,
			deadline: o.deadline!,
			// Positivo = días de atraso; negativo = días que faltan.
			days_late: Math.floor((now - new Date(o.deadline!).getTime()) / DAY),
		}));
	const overdue = withDeadline.filter((o) => new Date(o.deadline).getTime() < now).sort((a, b) => b.days_late - a.days_late);
	const dueSoon = withDeadline
		.filter((o) => {
			const t = new Date(o.deadline).getTime();
			return t >= now && t <= now + 7 * DAY;
		})
		// El más próximo primero (days_late más cercano a 0).
		.sort((a, b) => b.days_late - a.days_late);

	// ── En curso por estado ─────────────────────────────────────────────────
	const byStatus: Record<string, number> = {};
	for (const o of active) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;

	const machines: Record<string, number> = {};
	for (const m of machinesRes.data ?? []) {
		const k = String((m as any).status ?? 'sin_estado');
		machines[k] = (machines[k] ?? 0) + 1;
	}

	return NextResponse.json({
		truncated,
		total_ots: ots.length,
		sold: {
			current: Math.round(sold(from, to)),
			previous: cmpFrom ? Math.round(sold(cmpFrom, cmpTo)) : null,
			count: soldCount(from, to),
			by_month: months,
		},
		on_time: { current: onTime(from, to), previous: cmpFrom ? onTime(cmpFrom, cmpTo) : null },
		active: { total: active.length, by_status: byStatus, without_deadline: active.length - withDeadline.length },
		overdue,
		due_soon: dueSoon,
		fleet: {
			by_status: machines,
			total: (machinesRes.data ?? []).length,
			pending_maintenance: maintRes.count ?? 0,
		},
	});
}
