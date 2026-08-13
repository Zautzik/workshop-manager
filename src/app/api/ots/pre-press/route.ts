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
			'sin_arte, total_price, vb_id, created_at',
		)
		.eq('status', 'pre_press')
		.order('deadline', { ascending: true, nullsFirst: false });

	if (error) return NextResponse.json({ error: error.message }, { status: 500 });

	const ids = (ots ?? []).map((o: any) => o.id);
	if (ids.length === 0) {
		return NextResponse.json({ trabajos: [], diagnostics: { total: 0, listas: 0 } });
	}

	// Los rastros, en tres consultas en vez de tres por OT.
	const [programa, operaciones, adjuntos, cotizaciones] = await Promise.all([
		supabaseAdmin.from('ot_machine_schedule').select('ot_id').in('ot_id', ids),
		supabaseAdmin.from('ot_operations').select('ot_id').in('ot_id', ids),
		supabaseAdmin.from('ot_attachments').select('ot_id').in('ot_id', ids),
		supabaseAdmin
			.from('vistos_buenos')
			.select('id, total_price')
			.in('id', (ots ?? []).map((o: any) => o.vb_id).filter(Boolean)),
	]);

	const conjunto = (filas: any) => new Set(((filas?.data ?? []) as any[]).map((r) => r.ot_id));
	const conPrograma = conjunto(programa);
	const conOperaciones = conjunto(operaciones);
	const conArte = conjunto(adjuntos);
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
			finishes: {},
		};

		return {
			ot_id: o.id,
			ot_number: o.ot_number,
			client_name: o.client_name,
			deadline: o.deadline,
			spec,
			faltan: missingFor(2, spec).length,
			quoted_price: o.vb_id ? precioCotizado.get(o.vb_id) ?? null : null,
			firm_price: Number(o.total_price) || null,
		};
	});

	return NextResponse.json({
		// Las que menos les falta van primero: son las que se pueden cerrar hoy.
		trabajos: trabajos.sort((a, b) => a.faltan - b.faltan || String(a.deadline ?? '').localeCompare(String(b.deadline ?? ''))),
		diagnostics: {
			total: trabajos.length,
			listas: trabajos.filter((t) => t.faltan === 0).length,
		},
	});
}
