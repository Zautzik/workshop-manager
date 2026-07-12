import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export async function GET(_req: NextRequest) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	try {
		// generate_ot_number() returns the plant correlative (OT-NNNNN) — single
		// numbering source shared with convert_vb_to_ot(). No random fallback:
		// minting an off-format number breaks WhatsApp reporting (the parser
		// reads the short correlative), so failing visibly beats succeeding wrong.
		const { data, error } = await supabaseAdmin.rpc('generate_ot_number');

		if (error) {
			console.error('Error generating OT number:', error);
			return NextResponse.json(
				{ error: 'No se pudo generar el número de OT. Reintenta en unos segundos.' },
				{ status: 503 }
			);
		}

		return NextResponse.json({ ot_number: data });
	} catch (error) {
		console.error('Error generating OT number:', error);
		return NextResponse.json(
			{ error: 'No se pudo generar el número de OT. Reintenta en unos segundos.' },
			{ status: 503 }
		);
	}
}
