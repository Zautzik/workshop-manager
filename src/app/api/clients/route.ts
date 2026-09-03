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

	// El frontend (ClientManager.tsx) ya pide TODOS los clientes una vez y
	// filtra activos/inactivos en el propio navegador con `showInactive` —
	// el filtro `is_active=true` de acá los descartaba antes de que el
	// toggle pudiera hacer su trabajo, así que "Ver inactivos" nunca tenía
	// nada que mostrar y un cliente dado de baja desaparecía sin manera de
	// volver a verlo (auditoría 2026-08).
	const buscar = async (texto: string) => {
		let query = supabaseAdmin.from('clients').select('*').order('name');
		if (!scope.all) query = query.eq('salesman_id', scopeFilterId(scope));
		if (texto) query = query.ilike('name', `%${texto}%`);
		// 20 dejaba fuera del alfabeto a cualquier taller con más de 20
		// clientes — este ya tiene más. 500 es generoso para una cartera de
		// una imprenta y evita repetir el mismo error de cap silencioso que
		// ya costó una pantalla completa en otro lugar de la app.
		return query.limit(500);
	};

	try {
		const { data, error } = await buscar(q);
		if (!error) return NextResponse.json(data ?? []);
		throw error;
	} catch (error) {
		// Ciertas combinaciones de caracteres en `q` —un guion largo con un
		// «--» más adelante, entre otras que no se lograron aislar a una sola
		// causa— hacen que este `ilike` falle, a veces como error devuelto y a
		// veces como excepción tirada desde el cliente de Supabase, y tumbaban
		// el autocompletado de cliente en plena cotización (auditoría
		// 2026-09). El detalle real queda en el log del servidor para quien lo
		// investigue después; acá lo que importa es que un nombre de cliente
		// nunca debería poder romper su propia búsqueda, así que se reintenta
		// con el texto reducido a lo que realmente distingue un nombre
		// (letras, números, espacios y la puntuación común de una razón
		// social) antes de rendirse.
		console.error('Error fetching clients (query: %j):', q, error);

		const q2 = q.replace(/[^\p{L}\p{N}\s.,&'-]/gu, ' ').replace(/\s+/g, ' ').trim();
		if (q2 && q2 !== q) {
			try {
				const retry = await buscar(q2);
				if (!retry.error) return NextResponse.json(retry.data ?? []);
				console.error('Retry with sanitized query also failed:', retry.error);
			} catch (retryError) {
				console.error('Retry with sanitized query threw:', retryError);
			}
		}

		// Un buscador que no encuentra nada es una molestia; uno que tira la
		// pantalla de cotizar abajo es un incidente. Se prefiere lo primero.
		return NextResponse.json([]);
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
