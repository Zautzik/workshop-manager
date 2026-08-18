import { NextRequest, NextResponse } from 'next/server';
import { startOfMonth, subMonths, parseISO, isValid, format } from 'date-fns';

import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { fetchAll, truncationNote } from '@/lib/fetch-all';

export const dynamic = 'force-dynamic';

interface OtRow {
	id: string;
	status: string;
	created_at: string | null;
	completed_at: string | null;
	deadline: string | null;
}

/**
 * GET /api/analytics/trends?months=12
 *
 * Series mensuales para la pantalla de Tendencias: OT creadas/completadas,
 * ingresos/costo real/margen, cumplimiento de plazo y tiempo de ciclo. Se
 * agrega acá, no en el cliente — `useOTs()` trae como mucho 200 filas
 * (límite del endpoint paginado de `/api/ots`) y el taller ya pasó esa
 * marca, así que un promedio de doce meses armado con esas 200 sería el
 * promedio de un taller que no es este.
 *
 * Se pagina con `fetchAll` aunque hoy `ots` tenga sólo 234 filas: PostgREST
 * entrega 1.000 por consulta sin avisar cuando se corta, y ese exacto
 * silencio ya hizo que Rentabilidad mostrara 82% de margen en vez de 22%
 * (ver fetch-all.ts). Una consulta sin paginar que "hoy no truena" es la
 * misma consulta que trunca en silencio el día que el taller crece.
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

	const otsResult = await fetchAll<OtRow>((desde, hasta) =>
		supabaseAdmin
			.from('ots')
			.select('id, status, created_at, completed_at, deadline')
			.range(desde, hasta) as any,
	);
	const ots = otsResult.rows;

	const ids = ots.map((o) => o.id);
	const costByOt = new Map<string, { revenue: number; actual: number; margin: number }>();
	let costTruncationMsg: string | null = null;
	if (ids.length > 0) {
		const costResult = await fetchAll<any>((desde, hasta) =>
			supabaseAdmin
				.from('ot_cost_summary')
				.select('ot_id, revenue, actual_cost, gross_margin')
				.in('ot_id', ids)
				.range(desde, hasta) as any,
		);
		costTruncationMsg = truncationNote(costResult, 'líneas de costo');
		for (const r of costResult.rows) {
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
		cycleDaysSum: number;
		cycleDaysCount: number;
	};
	const byKey = new Map<string, Bucket>(
		bucketKeys.map((k) => [k, {
			month: k, created: 0, completed: 0, onTime: 0, onTimeEligible: 0,
			revenue: 0, cost: 0, margin: 0, conCosto: 0, cycleDaysSum: 0, cycleDaysCount: 0,
		}]),
	);

	for (const o of ots) {
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
					// Tiempo de ciclo: días de calendario entre que la OT nace y
					// se completa. Si `created_at` viene después (dato sucio), no
					// se cuenta — un ciclo negativo no informa, confunde.
					if (o.created_at) {
						const created = parseISO(o.created_at);
						if (isValid(created) && completed.getTime() >= created.getTime()) {
							b.cycleDaysSum += (completed.getTime() - created.getTime()) / 86_400_000;
							b.cycleDaysCount += 1;
						}
					}
				}
			}
		}
	}

	const monthly = bucketKeys.map((k) => {
		const b = byKey.get(k)!;
		return {
			month: b.month,
			created: b.created,
			completed: b.completed,
			onTime: b.onTime,
			onTimeEligible: b.onTimeEligible,
			revenue: b.revenue,
			cost: b.cost,
			margin: b.margin,
			conCosto: b.conCosto,
			onTimeRate: b.onTimeEligible > 0 ? Math.round((b.onTime / b.onTimeEligible) * 1000) / 10 : null,
			marginPct: b.revenue > 0 ? Math.round((b.margin / b.revenue) * 1000) / 10 : null,
			avgCycleDays: b.cycleDaysCount > 0 ? Math.round((b.cycleDaysSum / b.cycleDaysCount) * 10) / 10 : null,
		};
	});

	// "Distribución por estado" mezclaba 219 OT completadas con 15 activas
	// repartidas en diez etapas — un gráfico con una barra en 219 y el resto
	// en 1 ó 2 no muestra diez barras chicas, muestra nueve rayas invisibles
	// junto a una gigante. Se separa la pregunta: cuántas están completadas
	// (un número), y dónde está el trabajo que SÍ está en curso ahora mismo
	// (su propio gráfico, con su propia escala).
	const completedCount = ots.filter((o) => o.status === 'completed').length;
	const activeByStatus: Record<string, number> = {};
	for (const o of ots) {
		if (o.status === 'completed') continue;
		activeByStatus[o.status] = (activeByStatus[o.status] ?? 0) + 1;
	}

	const otsTruncationMsg = truncationNote(otsResult, 'OT');
	const warning = otsTruncationMsg ?? costTruncationMsg;

	return NextResponse.json({
		monthly,
		completedCount,
		activeByStatus,
		total: ots.length,
		warning,
	});
}
