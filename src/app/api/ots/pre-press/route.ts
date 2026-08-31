import { NextRequest, NextResponse } from 'next/server';

import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { missingFor, type OTSpec } from '@/lib/ot-spec';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ots/pre-press
 *
 * Las OT que están en Pre-Prensa, con lo que le falta a cada una para poder
 * mandar la prueba.
 *
 * Dos campos del nivel 2 no son columnas y se deducen del RASTRO de haberlos
 * hecho: un montaje confirmado deja un bloque en `ot_machine_schedule`, y unas
 * operaciones revisadas dejan filas en `ot_operations`. Preguntar por el rastro
 * es más fiable que por una casilla — una casilla la marca cualquiera sin haber
 * hecho el trabajo.
 */
export async function GET(_req: NextRequest) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor']);
	if (isAuthError(auth)) return auth;

	const { data: ots, error } = await supabaseAdmin
		.from('ots')
		.select(
			'id, ot_number, client_name, client_id, product_name, product_type, quantity, ' +
			'width_cm, height_cm, substrate_type, grammage_gsm, color_front, color_back, ' +
			'ink_coverage, deadline, assigned_machine_id, substrate_brand, substrate_supplier, ' +
			'sin_arte, total_price, vb_id, created_at, ' +
			// Las diez banderas de terminación. Sin ellas la ficha se armaba con
			// `finishes: {}` y NINGÚN pendiente de terminación podía aparecer: un
			// trabajo troquelado llegaba a la prueba sin que nadie confirmara que
			// el troquel existe.
			'finish_troquelado, finish_plegado, finish_pegado, finish_laminado, finish_barniz, ' +
			'finish_relieve, finish_perforado, finish_hot_stamping, finish_uv_localizado, finish_numeracion, ' +
			// El herramental que esas terminaciones necesitan.
			'die_source, die_code, die_id, cliche_code, relieve_matrix_code, lamination_type',
		)
		.eq('status', 'pre_press')
		.order('deadline', { ascending: true, nullsFirst: false })
		// Tope explícito: cada otra lista paginada de este repo lo tiene (ver
		// PageSchema en ots/route.ts, max 200) precisamente para no repetir el
		// fetch-de-tabla-completa que ya causó un bug de Rentabilidad (PostgREST
		// trunca en 1000 en silencio). Esta ruta no lo tenía -- inofensivo con 3
		// filas hoy, no cuando la cola crezca (auditoría 2026-08-31).
		.limit(200);

	if (error) return NextResponse.json({ error: error.message }, { status: 500 });

	const ids = (ots ?? []).map((o: any) => o.id);
	if (ids.length === 0) {
		return NextResponse.json({ trabajos: [], diagnostics: { total: 0, listas: 0 } });
	}

	// Los rastros, en cuatro consultas en vez de cuatro por OT.
	const [programa, operaciones, adjuntos, cotizaciones, historia] = await Promise.all([
		supabaseAdmin.from('ot_machine_schedule').select('ot_id').in('ot_id', ids),
		supabaseAdmin.from('ot_operations').select('ot_id').in('ot_id', ids),
		supabaseAdmin.from('ot_attachments').select('ot_id').in('ot_id', ids),
		supabaseAdmin
			.from('vistos_buenos')
			.select('id, total_price')
			.in('id', (ots ?? []).map((o: any) => o.vb_id).filter(Boolean)),
		// Cuándo entró a Pre-Prensa. `ot_status_history` ya lo escribe, así que la
		// antigüedad no necesita columna nueva — sólo que alguien la mire.
		supabaseAdmin
			.from('ot_status_history')
			.select('ot_id, created_at')
			.in('ot_id', ids)
			.eq('to_status', 'pre_press')
			.order('created_at', { ascending: false }),
	]);

	const conjunto = (filas: any) => new Set(((filas?.data ?? []) as any[]).map((r) => r.ot_id));
	const conPrograma = conjunto(programa);
	const conOperaciones = conjunto(operaciones);
	const conArte = conjunto(adjuntos);
	// La más reciente de cada OT: si volvió a Pre-Prensa, cuenta desde que volvió.
	const entroEl = new Map<string, string>();
	for (const h of ((historia?.data ?? []) as any[])) {
		if (!entroEl.has(h.ot_id)) entroEl.set(h.ot_id, h.created_at);
	}

	const precioCotizado = new Map(
		((cotizaciones?.data ?? []) as any[]).map((v) => [v.id, Number(v.total_price) || null]),
	);

	const trabajos = (ots ?? []).map((o: any) => {
		const spec: OTSpec = {
			clientId: o.client_id, productName: o.product_name, productType: o.product_type,
			quantity: o.quantity, widthCm: o.width_cm, heightCm: o.height_cm,
			substrateType: o.substrate_type, grammageGsm: o.grammage_gsm,
			colorFront: o.color_front, colorBack: o.color_back, inkCoverage: o.ink_coverage,
			deadline: o.deadline, pressId: o.assigned_machine_id,
			substrateBrand: o.substrate_brand, substrateSupplier: o.substrate_supplier,
			machineId: o.assigned_machine_id,
			impositionConfirmed: conPrograma.has(o.id),
			operationsReviewed: conOperaciones.has(o.id),
			artAttached: conArte.has(o.id),
			sinArte: o.sin_arte,
			// Las terminaciones REALES del trabajo. Antes iba `{}` fijo, así que
			// `missingFor` no podía preguntar por el troquel de un trabajo
			// troquelado: la condición nunca se cumplía.
			finishes: {
				troquelado: !!o.finish_troquelado,
				plegado: !!o.finish_plegado,
				pegado: !!o.finish_pegado,
				laminado: !!o.finish_laminado,
				barniz: !!o.finish_barniz,
				relieve: !!o.finish_relieve,
				perforado: !!o.finish_perforado,
				hot_stamping: !!o.finish_hot_stamping,
				uv_localizado: !!o.finish_uv_localizado,
				numeracion: !!o.finish_numeracion,
			},
			// Un troquel elegido del estante (`die_id`) responde las dos preguntas:
			// de dónde sale y cuál es.
			dieSource: o.die_id ? 'existente' : o.die_source,
			dieCode: o.die_id ? o.die_id : o.die_code,
			clicheCode: o.cliche_code,
			relieveMatrixCode: o.relieve_matrix_code,
			laminationType: o.lamination_type,
		};

		return {
			ot_id: o.id,
			ot_number: o.ot_number,
			client_name: o.client_name,
			deadline: o.deadline,
			spec,
			faltan: missingFor(2, spec).length,
			// Se manda la fecha, no los días: el cliente calcula contra SU reloj y
			// así una pestaña abierta desde ayer no miente.
			en_pre_prensa_desde: entroEl.get(o.id) ?? o.created_at,
			// Si TODO lo que falta lo debe el cliente, el taller no puede hacer nada
			// más que llamar. Es una lista de trabajo distinta.
			espera_al_cliente:
				missingFor(2, spec).length > 0 && missingFor(2, spec).every((g) => g.owner === 'cliente'),
			quoted_price: o.vb_id ? precioCotizado.get(o.vb_id) ?? null : null,
			firm_price: Number(o.total_price) || null,
		};
	});

	return NextResponse.json({
		// Ordena por ANTIGÜEDAD, no por lo que falta. Antes iban primero las que
		// menos les faltaba —las fáciles de cerrar— y eso es exactamente al revés
		// de cómo se gobierna una cola: lo que hunde una fecha de entrega es el
		// trabajo que lleva seis días esperando, no el que entró hoy con un hueco.
		// (El comentario anterior decía lo contrario de lo que este `sort` hace
		// -- quedó de la versión vieja del criterio; auditoría 2026-08-31.)
		trabajos: trabajos.sort((a, b) =>
			String(a.en_pre_prensa_desde).localeCompare(String(b.en_pre_prensa_desde)),
		),
		diagnostics: {
			total: trabajos.length,
			listas: trabajos.filter((t) => t.faltan === 0).length,
			esperando_al_cliente: trabajos.filter((t) => t.espera_al_cliente).length,
		},
	});
}
