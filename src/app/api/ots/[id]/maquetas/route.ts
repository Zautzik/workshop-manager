import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { maquetaCost, maquetaCostLines, type MaquetaRound } from '@/lib/maqueta';
import { sheetWeightKg } from '@/lib/paper-units';

export const dynamic = 'force-dynamic';

/**
 * Las maquetas de una OT.
 *
 * En Pre-Prensa se arma a mano un ejemplar del producto para que el cliente lo
 * tenga en la mano antes de aprobar. Es el costo que todos los sistemas pierden:
 * ocurre antes de que el trabajo exista, se repite, y se paga aunque el cliente
 * no apruebe.
 *
 * ── Por qué reemplaza en vez de acumular ────────────────────────────────────
 *
 * Registrar maquetas es corregir un número que se lleva de memoria —«fueron dos
 * vueltas, no una»— y una pantalla que acumula convierte cada corrección en una
 * duplicación. Las líneas se marcan con `ref_type = 'maqueta'`, se borran las
 * anteriores y se escriben las nuevas. Es idempotente: guardar dos veces lo
 * mismo deja lo mismo.
 */

const RondaSchema = z.object({
	sheets: z.number().min(0).max(500),
	handHours: z.number().min(0).max(40),
	/** Opcionales: si no vienen, se toman del trabajo y del catálogo. */
	costPerSheet: z.number().min(0).optional(),
	digitalPerSheet: z.number().min(0).optional(),
	hourlyRate: z.number().min(0).optional(),
	on: z.string().optional(),
});

const CuerpoSchema = z.object({
	rounds: z.array(RondaSchema).max(10),
	sampleDieCost: z.number().min(0).max(5_000_000).optional(),
});

const REF = 'maqueta';

/**
 * Valores por defecto tomados del trabajo, no inventados.
 *
 * La maqueta se arma con el sustrato REAL —para eso existe: que el cliente lo
 * toque— así que su costo por pliego es el mismo del tiraje. La mano de obra es
 * la tarifa de terminaciones del catálogo, y la impresión es el clic de la
 * digital, porque las planchas todavía no se grabaron.
 */
async function valoresPorDefecto(otId: string) {
	const [{ data: ot }, { data: catalogo }, { data: materiales }] = await Promise.all([
		supabaseAdmin.from('ots').select('substrate_type, grammage_gsm').eq('id', otId).maybeSingle(),
		supabaseAdmin.from('cost_catalog').select('catalog_key, name, unit_cost').eq('is_active', true),
		supabaseAdmin
			.from('inventory_items')
			.select('name, unit, estimated_unit_cost, sheet_width_cm, sheet_height_cm, grammage_gsm')
			.eq('category', 'product_input'),
	]);

	const porClave = new Map((catalogo ?? []).filter((c: any) => c.catalog_key).map((c: any) => [c.catalog_key, Number(c.unit_cost)]));
	const porNombre = new Map((catalogo ?? []).map((c: any) => [c.name, Number(c.unit_cost)]));

	const sustrato = (ot as any)?.substrate_type ?? '';
	const gsm = Number((ot as any)?.grammage_gsm) || 0;
	const clave = { couche: 'couch', cartulina: 'cartulina', bond: 'bond', kraft: 'kraft', adhesivo: 'adhesiv' }[sustrato as string] ?? sustrato;

	// El pliego de la maqueta cuesta lo mismo que el del tiraje: mismo material.
	const candidatos = (materiales ?? []).filter((m: any) => String(m.name).toLowerCase().includes(clave));
	const material = candidatos.sort(
		(a: any, b: any) => Math.abs((a.grammage_gsm ?? 9999) - gsm) - Math.abs((b.grammage_gsm ?? 9999) - gsm),
	)[0] as any;

	let costPerSheet = 0;
	if (material) {
		const peso = sheetWeightKg({
			widthCm: Number(material.sheet_width_cm) || 70,
			heightCm: Number(material.sheet_height_cm) || 100,
			gsm: Number(material.grammage_gsm) || gsm || 150,
		});
		costPerSheet = material.unit === 'kg' && peso ? Math.round(Number(material.estimated_unit_cost) * peso) : 0;
	}

	return {
		costPerSheet,
		digitalPerSheet: porNombre.get('Impresión Digital') ?? 595,
		hourlyRate: porClave.get('operador_terminaciones') ?? porNombre.get('Operador de Terminaciones') ?? 6500,
	};
}

/** GET — lo que ya está registrado. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor']);
	if (isAuthError(auth)) return auth;
	const { id } = await params;

	const { data, error } = await supabaseAdmin
		.from('ot_cost_lines')
		.select('id, category, description, quantity, unit, unit_cost, total')
		.eq('ot_id', id)
		.eq('ref_type', REF)
		.order('created_at', { ascending: true });

	if (error) return NextResponse.json({ error: error.message }, { status: 500 });

	// Los valores del trabajo viajan con la lectura para que la vista previa del
	// formulario use LOS MISMOS que el servidor va a usar al guardar. Sin esto el
	// formulario previsualizaba con una cartulina genérica y guardaba con el
	// adhesivo real: dos aritméticas para el mismo número.
	return NextResponse.json({
		lines: data ?? [],
		total: (data ?? []).reduce((s: number, l: any) => s + Number(l.total ?? 0), 0),
		defaults: await valoresPorDefecto(id),
	});
}

/** POST — registra las vueltas y escribe el costo al ledger. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor']);
	if (isAuthError(auth)) return auth;
	const { id } = await params;

	const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
	if (!cuerpo.success) {
		return NextResponse.json({ error: 'Datos inválidos', details: cuerpo.error.flatten() }, { status: 400 });
	}

	const def = await valoresPorDefecto(id);
	const rounds: MaquetaRound[] = cuerpo.data.rounds.map((r) => ({
		sheets: r.sheets,
		handHours: r.handHours,
		costPerSheet: r.costPerSheet ?? def.costPerSheet,
		digitalPerSheet: r.digitalPerSheet ?? def.digitalPerSheet,
		hourlyRate: r.hourlyRate ?? def.hourlyRate,
		on: r.on,
	}));

	const input = { rounds, sampleDieCost: cuerpo.data.sampleDieCost };
	const resumen = maquetaCost(input);
	const lineas = maquetaCostLines(input);

	// Reemplazo, no acumulación: corregir «fueron dos vueltas, no una» no puede
	// convertirse en cobrar tres.
	const { error: borrado } = await supabaseAdmin
		.from('ot_cost_lines')
		.delete()
		.eq('ot_id', id)
		.eq('ref_type', REF);
	if (borrado) return NextResponse.json({ error: borrado.message }, { status: 500 });

	if (lineas.length > 0) {
		const { error } = await supabaseAdmin.from('ot_cost_lines').insert(
			lineas.map((l) => ({
				ot_id: id,
				kind: 'actual' as const,
				category: l.category,
				source: 'manual',
				description: l.description,
				quantity: l.quantity,
				unit: l.unit,
				// `total` es columna generada: el costo unitario se deriva del total
				// para que lo que la vista suma sea lo que el cálculo produjo.
				unit_cost: l.quantity > 0 ? Math.round((l.total / l.quantity) * 10_000) / 10_000 : l.total,
				ref_type: REF,
				notes: 'Maqueta armada en Pre-Prensa. Se paga aunque el cliente no apruebe.',
			})),
		);
		if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ ok: true, resumen, defaults: def });
}
