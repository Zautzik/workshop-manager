import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { resolveSalesScope, scopeFilterId } from '@/lib/sales-scope';

// Helper: transform empty strings to null so optional fields don't fail validation
const optStr = (max: number) =>
	z.preprocess(
		(v) => (typeof v === 'string' && v.trim() === '' ? null : v),
		z.string().max(max).nullable().optional()
	);
const optEmail = () =>
	z.preprocess(
		(v) => (typeof v === 'string' && v.trim() === '' ? null : v),
		z.string().email().max(255).nullable().optional()
	);

const CreateClientSchema = z.object({
	name: z.string().min(1).max(255),
	rut: optStr(50),
	contact_name: optStr(255),
	phone: optStr(50),
	email: optEmail(),
	address: optStr(500),
	city: optStr(100),
	payment_terms: optStr(100),
	notes: optStr(2000),
});

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { searchParams } = new URL(req.url);
	const q = searchParams.get('q')?.trim() || '';

	// Row-scoping: a vendedor sees only their own clients; ops/management see all.
	const scope = await resolveSalesScope(auth);

	try {
		// El frontend (ClientManager.tsx) ya pide TODOS los clientes una vez y
		// filtra activos/inactivos en el propio navegador con `showInactive` —
		// el filtro `is_active=true` de acá los descartaba antes de que el
		// toggle pudiera hacer su trabajo, así que "Ver inactivos" nunca tenía
		// nada que mostrar y un cliente dado de baja desaparecía sin manera de
		// volver a verlo (auditoría 2026-08).
		let query = supabaseAdmin
			.from('clients')
			.select('*')
			.order('name');

		if (!scope.all) {
			query = query.eq('salesman_id', scopeFilterId(scope));
		}

		if (q) {
			query = query.ilike('name', `%${q}%`);
		}

		// 20 dejaba fuera del alfabeto a cualquier taller con más de 20
		// clientes — este ya tiene más. 500 es generoso para una cartera de
		// una imprenta y evita repetir el mismo error de cap silencioso que
		// ya costó una pantalla completa en otro lugar de la app.
		query = query.limit(500);

		const { data, error } = await query;

		if (error) {
			console.error('Error fetching clients:', error);
			return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
		}

		return NextResponse.json(data ?? []);
	} catch (error) {
		console.error('Error fetching clients:', error);
		return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
	}
}

export async function POST(req: NextRequest) {
	const auth = await requireAuth(['supervisor', 'admin', 'manager']);
	if (isAuthError(auth)) return auth;

	try {
		const body = await req.json();
		const parsed = CreateClientSchema.safeParse(body);

		if (!parsed.success) {
			console.error('Validation error:', JSON.stringify(parsed.error.flatten().fieldErrors));
			return NextResponse.json(
				{ error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const { data, error } = await supabaseAdmin
			.from('clients')
			.insert([parsed.data])
			.select('*')
			.single();

		if (error) {
			console.error('Error creating client:', error);
			return NextResponse.json(
				{ error: 'Failed to create client', detail: error.message, code: error.code },
				{ status: 500 }
			);
		}

		return NextResponse.json(data, { status: 201 });
	} catch (error: any) {
		console.error('Error creating client:', error);
		return NextResponse.json(
			{ error: 'Failed to create client', detail: error?.message ?? 'Unknown error' },
			{ status: 500 }
		);
	}
}
