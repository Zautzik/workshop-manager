import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const CreateWorkerSchema = z.object({
	name: z.string().min(1).max(255),
	department: z.string().min(1).max(100),
	status: z.enum(['active', 'inactive']).optional(),
});

export async function GET(_req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { data, error } = await supabaseAdmin
			.from('workers')
			.select('*')
			.order('name', { ascending: true });

		if (error) {
			console.error('Error fetching workers:', error);
			return NextResponse.json({ error: 'Failed to fetch workers' }, { status: 500 });
		}

		return NextResponse.json(data ?? []);
	} catch (error) {
		console.error('Error fetching workers:', error);
		return NextResponse.json({ error: 'Failed to fetch workers' }, { status: 500 });
	}
}

export async function POST(req: NextRequest) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	try {
		const body = await req.json();
		const parsed = CreateWorkerSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const { data, error } = await supabaseAdmin
			.from('workers')
			.insert([parsed.data])
			.select('*')
			.single();

		if (error) {
			console.error('Error creating worker:', error);
			return NextResponse.json({ error: 'Failed to create worker' }, { status: 500 });
		}

		return NextResponse.json(data, { status: 201 });
	} catch (error) {
		console.error('Error creating worker:', error);
		return NextResponse.json({ error: 'Failed to create worker' }, { status: 500 });
	}
}
