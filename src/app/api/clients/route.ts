import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const CreateClientSchema = z.object({
	name: z.string().min(1).max(255),
	rut: z.string().max(50).optional().nullable(),
	contact_name: z.string().max(255).optional().nullable(),
	phone: z.string().max(50).optional().nullable(),
	email: z.string().email().max(255).optional().nullable(),
	address: z.string().max(500).optional().nullable(),
	city: z.string().max(100).optional().nullable(),
	payment_terms: z.string().max(100).optional().nullable(),
	notes: z.string().max(2000).optional().nullable(),
});

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { searchParams } = new URL(req.url);
	const q = searchParams.get('q')?.trim() || '';

	try {
		let query = supabaseAdmin
			.from('clients')
			.select('*')
			.eq('is_active', true)
			.order('name');

		if (q) {
			query = query.ilike('name', `%${q}%`);
		}

		query = query.limit(20);

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
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	try {
		const body = await req.json();
		const parsed = CreateClientSchema.safeParse(body);

		if (!parsed.success) {
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
			return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
		}

		return NextResponse.json(data, { status: 201 });
	} catch (error) {
		console.error('Error creating client:', error);
		return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
	}
}
