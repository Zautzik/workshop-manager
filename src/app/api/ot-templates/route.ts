import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export async function GET(_req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { data, error } = await supabaseAdmin
			.from('ot_templates')
			.select('*')
			.eq('is_active', true)
			.order('name');

		if (error) {
			console.error('Error fetching templates:', error);
			return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
		}

		return NextResponse.json(data ?? []);
	} catch (error) {
		console.error('Error fetching templates:', error);
		return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
	}
}

export async function POST(req: NextRequest) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	try {
		const body = await req.json();

		const { data, error } = await supabaseAdmin
			.from('ot_templates')
			.insert([{
				name: body.name,
				description: body.description || null,
				product_type: body.product_type || null,
				substrate_type: body.substrate_type || null,
				grammage_gsm: body.grammage_gsm || null,
				width_cm: body.width_cm || null,
				height_cm: body.height_cm || null,
				color_front: body.color_front || 'cmyk',
				color_back: body.color_back || 'sin_impresion',
				finishes: body.finishes || {},
				default_operations: body.default_operations || [],
				margin_pct: body.margin_pct ?? 10,
				increment_pct: body.increment_pct ?? 10,
				commission_pct: body.commission_pct ?? 1,
				created_by: typeof auth === 'object' && 'id' in auth ? auth.id : null,
			}])
			.select('*')
			.single();

		if (error) {
			console.error('Error creating template:', error);
			return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
		}

		return NextResponse.json(data, { status: 201 });
	} catch (error) {
		console.error('Error creating template:', error);
		return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
	}
}
