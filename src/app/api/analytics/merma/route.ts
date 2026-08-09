import { NextRequest, NextResponse } from 'next/server';

import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { aggregateMerma, evaluateMerma } from '@/lib/merma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics/merma
 *
 * La merma sale de lo que el taller ya reporta por WhatsApp: el operario
 * escribe «62.000 pliegos, 900 de merma» y el analizador lo guarda en
 * `capture_events.parsed_data`. Aquí sólo se agrupa y se juzga.
 *
 * El cálculo vive en `merma.ts`, puro y con pruebas — incluida la razón por la
 * que la tasa se mide sobre el papel entrado y no sobre el vendible, y por la
 * que un 8% se juzga distinto en un tiraje de 500 que en uno de 100.000.
 *
 * DIAGNÓSTICO. Cuando no hay nada que mostrar dice POR QUÉ, en vez de devolver
 * una lista vacía y dejar que la pantalla ponga «sin datos». Hoy la razón
 * honesta es que los partes citan OT que ya no existen.
 */
export async function GET(_req: NextRequest) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor']);
	if (isAuthError(auth)) return auth;

	const { data: capturas, error } = await supabaseAdmin
		.from('capture_events')
		.select('id, ot_id, ot_number, operator_name, parsed_data, message_timestamp')
		.eq('domain', 'production');

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	const filas = (capturas ?? []) as any[];

	/** Sólo las que traen alguna cifra de papel; las demás son partes de estado. */
	const conCifras = filas.filter((c) => {
		const p = c.parsed_data ?? {};
		return p.merma != null || p.pliegos_produced != null || p.buenos != null;
	});

	// Se agrupa por OT. Cuando la captura no resolvió su `ot_id` se usa el
	// número citado: sigue siendo el mismo trabajo aunque falte la clave foránea.
	const porOt = new Map<string, { ot: string; ot_id: string | null; merma: number; pliegos: number; buenos: number; partes: number; operarios: Set<string> }>();

	for (const c of conCifras) {
		const p = c.parsed_data ?? {};
		const clave = c.ot_number ? String(c.ot_number).replace(/^ot[-\s]*/i, '') : '(sin OT)';
		const acc = porOt.get(clave) ?? {
			ot: clave, ot_id: c.ot_id ?? null,
			merma: 0, pliegos: 0, buenos: 0, partes: 0, operarios: new Set<string>(),
		};
		acc.merma += Number(p.merma ?? 0) || 0;
		acc.pliegos += Number(p.pliegos_produced ?? 0) || 0;
		acc.buenos += Number(p.buenos ?? 0) || 0;
		acc.partes += 1;
		if (c.operator_name) acc.operarios.add(c.operator_name);
		if (!acc.ot_id && c.ot_id) acc.ot_id = c.ot_id;
		porOt.set(clave, acc);
	}

	const trabajos = [...porOt.values()]
		.map((a) => {
			const v = evaluateMerma({ merma: a.merma, pliegos: a.pliegos, buenos: a.buenos });
			return {
				ot: a.ot,
				ot_id: a.ot_id,
				partes: a.partes,
				operarios: [...a.operarios],
				merma: v.wasted,
				pliegos: v.entered,
				rate: v.rate,
				level: v.level,
				note: v.note,
				band: v.band,
			};
		})
		.filter((t) => t.rate !== null)
		.sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));

	const total = aggregateMerma(
		conCifras.map((c) => ({
			merma: c.parsed_data?.merma ?? null,
			pliegos: c.parsed_data?.pliegos_produced ?? null,
			buenos: c.parsed_data?.buenos ?? null,
		})),
	);

	// Por qué no hay más de lo que hay.
	const razones: string[] = [];
	if (filas.length > 0 && conCifras.length === 0) {
		razones.push(
			`Ninguno de los ${filas.length} partes de producción trae cifras de pliegos. Se reportan avances en texto, sin cantidad.`,
		);
	}
	const huerfanas = conCifras.filter((c) => !c.ot_id).length;
	if (huerfanas > 0) {
		razones.push(
			`${huerfanas} de ${conCifras.length} partes con cifras citan una OT que ya no existe en el sistema, así que su merma no se puede cargar a ningún trabajo vivo.`,
		);
	}

	return NextResponse.json({
		trabajos,
		total: { rate: total.rate, merma: total.wasted, pliegos: total.entered, level: total.level },
		diagnostics: {
			partes_produccion: filas.length,
			partes_con_cifras: conCifras.length,
			partes_sin_ot: huerfanas,
			blocked: trabajos.length === 0,
			reasons: razones,
		},
	});
}
