import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { CorrectionsSchema, previewReviewMove } from '@/lib/golden-thread';

/**
 * POST /api/captures/preview-move — adónde movería la OT este parte si se
 * aprobara con estas correcciones. No escribe nada.
 *
 * La revisión lo usa para pedir el papel ANTES de aprobar: si el parte hace
 * entrar la OT a la primera etapa de su ruta, el papel sale de bodega
 * (paper-issue.ts) y quien revisa confirma el lote y los pliegos.
 */
const PreviewSchema = z
	.object({
		source: z.enum(['capture', 'whatsapp']),
		id: z.string().uuid(),
		data: CorrectionsSchema.shape.data,
	})
	.strict();

export async function POST(req: NextRequest) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor']);
	if (isAuthError(auth)) return auth;

	const parsed = PreviewSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
	}
	try {
		const r = await previewReviewMove(parsed.data.source, parsed.data.id, parsed.data.data);
		if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
		return NextResponse.json({ ot_id: r.otId, to_status: r.toStatus, moved_units: r.movedUnits });
	} catch (err) {
		console.error('Error previewing report move:', err);
		return NextResponse.json({ error: err instanceof Error ? err.message : 'No se pudo calcular el movimiento' }, { status: 500 });
	}
}
