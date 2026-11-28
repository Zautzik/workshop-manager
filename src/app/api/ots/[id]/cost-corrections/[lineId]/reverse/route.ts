import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { reverseCostCorrection } from '@/lib/cost-correction';

/**
 * POST /api/ots/[id]/cost-corrections/[lineId]/reverse  { reason }
 *
 * Anula una corrección del costo real con un asiento contrario. Las dos
 * líneas quedan en el libro con sus motivos; nada se borra. La regla vive en
 * `src/lib/cost-correction.ts`.
 */
const BodySchema = z.object({
	reason: z.string().trim().min(3, 'Anular una corrección necesita su motivo.').max(1000),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) {
	const auth = await requireAuth(['admin', 'supervisor']);
	if (isAuthError(auth)) return auth;

	const { id, lineId } = await params;
	if (!z.string().guid().safeParse(id).success || !z.string().guid().safeParse(lineId).success) {
		return NextResponse.json({ error: 'Se requieren el ID de la OT y de la corrección' }, { status: 400 });
	}
	const parsed = BodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors }, { status: 400 });
	}

	const result = await reverseCostCorrection(supabaseAdmin, {
		otId: id,
		lineId,
		actorId: auth.id,
		reason: parsed.data.reason,
	});
	if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
	return NextResponse.json({ id: result.id }, { status: 201 });
}
