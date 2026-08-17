import { NextRequest, NextResponse } from 'next/server';
import { startOfMonth, subMonths, parseISO, isValid, format } from 'date-fns';

import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics/trends?months=12
 *
 * Series mensuales para la pantalla de Tendencias: OT creadas/completadas,
 * ingresos/costo real/margen y cumplimiento de plazo. Se agrega acá, no en
 * el cliente — `useOTs()` trae como mucho 200 filas (límite del endpoint
 * paginado de `/api/ots`) y el taller ya pasó esa marca, así que un
 * promedio de doce meses armado con esas 200 sería el promedio de un taller
 * que no es este. Acá se lee todo `ots` sin ese límite.
 *
 * Ingresos/costo/margen se cuentan en el mes de CIERRE (`completed_at`), no
 * de creación: una OT no deja plata hasta que se completa y se factura. El
 * conteo de "creadas" sí usa `created_at` — son preguntas distintas y una
 * misma OT puede caer en dos meses distintos para cada una.
 */
export async function GET(req: NextRequest) {
	const auth = await requireAuth(['admin', 'manager']);
	if (isAuthError(auth)) return auth;

	const monthsParam = Number(new URL(req.url).searchParams.get('months'));
	const months = Number.isFinite(monthsParam) ? Math.min(24, Math.max(3, monthsParam)) : 12;

	const { data: ots, error } = await supabaseAdmin
		.from('ots')
		.select('id, status, created_at, completed_at, deadline');

	if (error) return NextResponse.json({ error: error.message }, { status: 500 });

	const ids = (ots ?? []).map((o) => o.id);
	const costByOt = new Map<string, { revenue: number; actual: number; margin: number }>();
	if (ids.length > 0) {
		const { data: resumen } = await supabaseAdmin
			.from('ot_cost_summary')
			.select('ot_id, revenue, actual_cost, gross_margin')
			.in('ot_id', ids);
		for (const r of (resumen ?? []) as any[]) {
			costByOt.set(r.ot_id, {
				revenue: Number(r.revenue ?? 0),
				actual: Number(r.actual_cost ?? 0),
				margin: Number(r.gross_margin ?? 0),
			});
		}
	}

	// Ventana de meses fija, en orden — así un mes sin OT igual aparece en
	// cero en el eje en vez de faltar y correr el resto de las etiquetas.
	const now = new Date();
	const bucketKeys = Array.from({ length: months }, (_, i) =>
		format(startOfMonth(subMonths(now, months - 1 - i)), 'yyyy-MM'),
	);
	type Bucket = {
		month: string;
		created: number;
		completed: number;
		onTime: number;
		onTimeEligible: number;
		revenue: number;
		cost: number;
		margin: number;
		conCosto: number;
	};
	const byKey = new Map<string, Bucket>(
		bucketKeys.map((k) => [k, {
			month: k, created: 0, completed: 0, onTime: 0, onTimeEligible: 0,
			revenue: 0, cost: 0, margin: 0, conCosto: 0,
		}]),
	);

	for (const o of (ots ?? []) as any[]) {
		if (o.created_at) {
			const created = parseISO(o.created_at);
			if (isValid(created)) {
				const b = byKey.get(format(startOfMonth(created), 'yyyy-MM'));
				if (b) b.created += 1;
			}
		}

		if (o.status === 'completed' && o.completed_at) {
			const completed = parseISO(o.completed_at);
			if (isValid(completed)) {
				const b = byKey.get(format(startOfMonth(completed), 'yyyy-MM'));
				if (b) {
					b.completed += 1;
					if (o.deadline) {
						b.onTimeEligible += 1;
						if (completed.getTime() <= new Date(o.deadline).getTime()) b.onTime += 1;
					}
					const cost = costByOt.get(o.id);
					if (cost && cost.actual > 0) {
						b.revenue += cost.revenue;
						b.cost += cost.actual;
						b.margin += cost.margin;
						b.conCosto += 1;
					}
				}
			}
		}
	}

	const monthly = bucketKeys.map((k) => {
		const b = byKey.get(k)!;
		return {
			...b,
			onTimeRate: b.onTimeEligible > 0 ? Math.round((b.onTime / b.onTimeEligible) * 1000) / 10 : null,
			marginPct: b.revenue > 0 ? Math.round((b.margin / b.revenue) * 1000) / 10 : null,
		};
	});

	const statusCounts: Record<string, number> = {};
	for (const o of (ots ?? []) as any[]) {
		statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
	}

	return NextResponse.json({
		monthly,
		statusCounts,
		total: (ots ?? []).length,
	});
}
