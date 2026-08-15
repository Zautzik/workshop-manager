import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { shelfHealth, suggestDies, type Die } from '@/lib/dies';

export const dynamic = 'force-dynamic';

/**
 * El estante de troqueles.
 *
 * `GET` sin parámetros devuelve el estante entero con su salud. `GET` con
 * medidas devuelve SÓLO los que sirven para ese trabajo, ordenados — que es la
 * pregunta real: «¿tenemos uno de 9×12?». Contestarla en la pantalla es lo que
 * evita mandar a hacer uno que ya está.
 */

// `dies` es nueva y los tipos generados todavía no la conocen. El escape es
// acotado y con fecha de vencimiento: se va con el próximo `supabase gen types`
// después de aplicar 20260815170000.
const db = supabaseAdmin as unknown as {
	from: (t: string) => any;
};

const COLUMNAS =
	'id, code, name, product_type, width_cm, height_cm, cavities, shelf_location, ' +
	'client_id, exclusive, acquisition_cost, acquired_on, status, times_used, last_used_at, notes';

/** De la base al modelo del dominio. Una sola traducción, acá. */
function aDominio(r: Record<string, unknown>): Die {
	return {
		id: String(r.id),
		code: String(r.code),
		name: String(r.name),
		productType: (r.product_type as string) ?? null,
		widthCm: r.width_cm == null ? null : Number(r.width_cm),
		heightCm: r.height_cm == null ? null : Number(r.height_cm),
		cavities: Number(r.cavities ?? 1),
		shelfLocation: (r.shelf_location as string) ?? null,
		clientId: (r.client_id as string) ?? null,
		exclusive: Boolean(r.exclusive),
		acquisitionCost: r.acquisition_cost == null ? null : Number(r.acquisition_cost),
		status: (r.status as Die['status']) ?? 'activo',
		timesUsed: Number(r.times_used ?? 0),
		lastUsedAt: (r.last_used_at as string) ?? null,
	};
}

export async function GET(req: NextRequest) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor', 'vendedor']);
	if (isAuthError(auth)) return auth;

	const { data, error } = await db
		.from('dies')
		.select(COLUMNAS)
		.order('times_used', { ascending: false });

	if (error) return NextResponse.json({ error: error.message }, { status: 500 });
	const estante = ((data ?? []) as unknown as Record<string, unknown>[]).map(aDominio);

	const q = req.nextUrl.searchParams;
	const ancho = Number(q.get('width'));
	const alto = Number(q.get('height'));

	// Con medidas, la pregunta es otra: no «qué hay» sino «qué me sirve».
	if (ancho > 0 && alto > 0) {
		const sugeridos = suggestDies(estante, {
			widthCm: ancho,
			heightCm: alto,
			productType: q.get('productType'),
			clientId: q.get('clientId'),
		});
		return NextResponse.json({
			sugeridos: sugeridos.map((m) => ({ ...m.die, razones: m.reasons })),
			hay: sugeridos.length,
			revisados: estante.length,
		});
	}

	return NextResponse.json({ dies: estante, salud: shelfHealth(estante) });
}

const NuevoSchema = z.object({
	code: z.string().min(1).max(40),
	name: z.string().min(1).max(160),
	productType: z.string().max(40).nullish(),
	widthCm: z.number().positive().max(300).nullish(),
	heightCm: z.number().positive().max(300).nullish(),
	cavities: z.number().int().min(1).max(200).default(1),
	shelfLocation: z.string().max(60).nullish(),
	clientId: z.string().uuid().nullish(),
	exclusive: z.boolean().default(false),
	acquisitionCost: z.number().min(0).max(50_000_000).nullish(),
	notes: z.string().max(1000).nullish(),
});

export async function POST(req: NextRequest) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor']);
	if (isAuthError(auth)) return auth;

	const parsed = NuevoSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: 'Cuerpo inválido', detalles: parsed.error.issues }, { status: 400 });
	}
	const d = parsed.data;

	const { data, error } = await db
		.from('dies')
		.insert({
			code: d.code.trim(), name: d.name.trim(), product_type: d.productType ?? null,
			width_cm: d.widthCm ?? null, height_cm: d.heightCm ?? null, cavities: d.cavities,
			shelf_location: d.shelfLocation ?? null, client_id: d.clientId ?? null,
			exclusive: d.exclusive, acquisition_cost: d.acquisitionCost ?? null,
			notes: d.notes ?? null, acquired_on: new Date().toISOString().slice(0, 10),
		} as never)
		.select(COLUMNAS)
		.single();

	if (error) {
		// El código es único porque es lo que está escrito en la madera: dos
		// troqueles con el mismo número es no poder encontrar ninguno.
		const repetido = error.code === '23505';
		return NextResponse.json(
			{ error: repetido ? `Ya hay un troquel con el código ${d.code}.` : error.message },
			{ status: repetido ? 409 : 500 },
		);
	}

	return NextResponse.json({ die: aDominio(data as unknown as Record<string, unknown>) }, { status: 201 });
}
