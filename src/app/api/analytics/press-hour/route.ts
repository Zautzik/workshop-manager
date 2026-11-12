import { NextRequest, NextResponse } from 'next/server';

import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { costPerThousand, marginPerPressHour, pricePerThousand, rankByPressHour } from '@/lib/print-economics';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics/press-hour
 *
 * Las dos cifras con que se dirige una imprenta y que ninguna pantalla daba:
 * el costo por MILLAR —la unidad en que la industria cotiza— y el margen por
 * HORA DE PRENSA, que es lo que decide qué se programa cuando la máquina es el
 * cuello de botella.
 *
 * Las horas salen de lo que la propia OT calculó al cotizarse
 * (`calc_print_hours` + `calc_finish_hours`) y los pliegos de `calc_sheets`.
 * El cálculo vive en `print-economics.ts`, puro y con pruebas.
 */
export async function GET(_req: NextRequest) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor']);
	if (isAuthError(auth)) return auth;

	const { data: ots, error } = await supabaseAdmin
		.from('ots')
		.select('id, ot_number, client_name, status, total_price, quantity, calc_sheets, calc_print_hours, calc_finish_hours');

	if (error) return NextResponse.json({ error: error.message }, { status: 500 });

	// La vista tiene una fila por OT: se lee entera. Antes se filtraba con
	// `.in('ot_id', <todas las OT>)`; con 250 ids la URL del pedido se pasa del
	// largo que acepta el servidor, el pedido fallaba, y como no se miraba el
	// error, todas las OT salían «sin costo real» y la cola no se podía ordenar
	// (2026-11-12).
	const costos = new Map<string, number>();
	const { data: resumen, error: resumenError } = await supabaseAdmin
		.from('ot_cost_summary')
		.select('ot_id, actual_cost')
		.range(0, 9999);
	if (resumenError) {
		return NextResponse.json({ error: `No se pudo leer el costo real: ${resumenError.message}` }, { status: 500 });
	}
	for (const r of (resumen ?? []) as any[]) costos.set(r.ot_id, Number(r.actual_cost ?? 0));

	const filas = (ots ?? []).map((o: any) => {
		const cost = costos.get(o.id) ?? 0;
		// Pliegos: los que el asistente calculó al cotizar. Sin ellos no hay
		// millar, y el millar es lo que vuelve comparables dos tirajes distintos.
		const sheets = Number(o.calc_sheets ?? 0) || null;
		// Horas de máquina que el trabajo ocupa, arreglo incluido.
		const pressHours =
			(Number(o.calc_print_hours ?? 0) || 0) + (Number(o.calc_finish_hours ?? 0) || 0) || null;

		return {
			ot_id: o.id,
			ot: o.ot_number,
			cliente: o.client_name,
			status: o.status,
			revenue: Number(o.total_price ?? 0) || 0,
			cost,
			sheets,
			pressHours,
			costoMillar: costPerThousand({ cost, sheets }),
			precioMillar: pricePerThousand(Number(o.total_price ?? 0) || 0, sheets),
		};
	});

	const ranked = rankByPressHour(filas).map((r) => ({
		...r,
		margen: r.verdict.margin,
		margenHora: r.verdict.marginPerHour,
		motivo: r.verdict.reason,
		verdict: undefined,
	}));

	// Por qué la lista puede venir sin cifras.
	const razones: string[] = [];
	const sinHoras = filas.filter((f) => f.pressHours === null).length;
	const sinPliegos = filas.filter((f) => f.sheets === null).length;
	const sinCosto = filas.filter((f) => f.cost <= 0).length;
	if (sinCosto > 0) {
		razones.push(
			`${sinCosto} de ${filas.length} OT no tienen costo real cargado, así que no se les puede repartir margen por hora.`,
		);
	}
	if (sinPliegos > 0) {
		razones.push(
			`${sinPliegos} de ${filas.length} OT no traen pliegos calculados: sin ellos no hay costo por millar.`,
		);
	}
	if (sinHoras > 0) {
		razones.push(
			`${sinHoras} de ${filas.length} OT no traen horas de máquina estimadas.`,
		);
	}

	return NextResponse.json({
		trabajos: ranked,
		diagnostics: {
			total: filas.length,
			sin_costo: sinCosto,
			sin_pliegos: sinPliegos,
			sin_horas: sinHoras,
			blocked: ranked.every((r) => r.margenHora === null),
			reasons: razones,
		},
	});
}
