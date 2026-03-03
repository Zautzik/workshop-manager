import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export async function GET(_req: NextRequest) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	try {
		const { data, error } = await supabaseAdmin.rpc('generate_ot_number');

		if (error) {
			console.error('Error generating OT number:', error);
			// Fallback: generate client-side
			const year = new Date().getFullYear();
			const rand = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
			return NextResponse.json({ ot_number: `OT-${year}-${rand}` });
		}

		return NextResponse.json({ ot_number: data });
	} catch (error) {
		console.error('Error generating OT number:', error);
		const year = new Date().getFullYear();
		const rand = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
		return NextResponse.json({ ot_number: `OT-${year}-${rand}` });
	}
}
