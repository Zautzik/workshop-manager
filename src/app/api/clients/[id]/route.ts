import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

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

const UpdateClientSchema = z.object({
	name: z.string().min(1).max(255).optional(),
	rut: optStr(50),
	contact_name: optStr(255),
	phone: optStr(50),
	email: optEmail(),
	address: optStr(500),
	city: optStr(100),
	payment_terms: optStr(100),
	notes: optStr(2000),
	is_active: z.boolean().optional(),
});

export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { id } = await params;

	try {
		const { data, error } = await supabaseAdmin
			.from('clients')
			.select('*')
			.eq('id', id)
			.single();

		if (error || !data) {
			return NextResponse.json({ error: 'Client not found' }, { status: 404 });
		}

		return NextResponse.json(data);
	} catch (error) {
		console.error('Error fetching client:', error);
		return NextResponse.json({ error: 'Failed to fetch client' }, { status: 500 });
	}
}

export async function PATCH(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const auth = await requireAuth(['supervisor', 'admin', 'manager']);
	if (isAuthError(auth)) return auth;

	const { id } = await params;

	try {
		const body = await req.json();
		const parsed = UpdateClientSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const { data, error } = await supabaseAdmin
			.from('clients')
			.update({ ...parsed.data, updated_at: new Date().toISOString() })
			.eq('id', id)
			.select('*')
			.single();

		if (error) {
			console.error('Error updating client:', error);
			return NextResponse.json({ error: 'Failed to update client' }, { status: 500 });
		}

		return NextResponse.json(data);
	} catch (error) {
		console.error('Error updating client:', error);
		return NextResponse.json({ error: 'Failed to update client' }, { status: 500 });
	}
}

export async function DELETE(
	_req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const auth = await requireAuth(['admin']);
	if (isAuthError(auth)) return auth;

	const { id } = await params;

	try {
		// Soft-delete: set is_active = false
		const { error } = await supabaseAdmin
			.from('clients')
			.update({ is_active: false, updated_at: new Date().toISOString() })
			.eq('id', id);

		if (error) {
			console.error('Error deleting client:', error);
			return NextResponse.json({ error: 'Failed to delete client' }, { status: 500 });
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Error deleting client:', error);
		return NextResponse.json({ error: 'Failed to delete client' }, { status: 500 });
	}
}
