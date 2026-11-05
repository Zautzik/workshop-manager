import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { CorrectionsSchema, reviewCapture, type ReviewOutcome } from '@/lib/golden-thread';

/**
 * POST /api/captures/review — la única puerta de revisión de partes.
 *
 * La bandeja de Capturas, la pantalla de WhatsApp y bodega revisan por acá,
 * de a uno o en lote. Lo que pasa al aprobar es el eslabón 2 del hilo dorado
 * (`reviewCapture`, src/lib/golden-thread.ts); esta ruta sólo autentica y valida.
 *
 * «Solicitar revisión» se fusionó con «Rechazar» (2026-11): hay dos decisiones.
 */

const ReviewSchema = z.object({
	source: z.enum(['capture', 'whatsapp', 'warehouse']),
	ids: z.array(z.string().uuid()).min(1).max(50),
	decision: z.enum(['approve', 'reject']),
	comments: z.string().max(2000).optional().nullable(),
	// Sólo de a uno: corregir un lote entero con los mismos números no tiene sentido.
	corrections: CorrectionsSchema.optional(),
}).strict().refine((b) => !b.corrections || b.ids.length === 1, {
	message: 'Las correcciones se aplican a un parte por vez',
	path: ['corrections'],
});

export async function POST(req: NextRequest) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor']);
	if (isAuthError(auth)) return auth;

	const parsed = ReviewSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
	}
	const { source, ids, decision, comments, corrections } = parsed.data;
	const actor = { id: auth.id, role: auth.role! };

	// Uno por uno y en orden: dos partes de la misma OT en el mismo lote se
	// aplican sobre el estado que dejó el anterior.
	const results: ReviewOutcome[] = [];
	for (const id of ids) {
		const r = await reviewCapture(source, id, { decision, comments: comments ?? null, corrections }, actor);
		results.push(
			r.ok
				? {
						id, ok: true, applied: r.applied, moved: r.flow?.moved ?? null,
						...(r.warnings.length > 0 ? { warning: r.warnings.join(' · ') } : {}),
					}
				: { id, ok: false, error: r.error, status: r.status },
		);
	}

	// De a uno, el error del parte es el error de la respuesta: la pantalla lo
	// muestra tal cual.
	if (ids.length === 1 && !results[0].ok) {
		return NextResponse.json({ error: results[0].error, results }, { status: results[0].status ?? 400 });
	}
	return NextResponse.json({ results }, { status: results.some((r) => r.warning) ? 202 : 200 });
}
