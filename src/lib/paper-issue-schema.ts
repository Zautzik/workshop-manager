/**
 * La forma en que la salida de papel viaja por la red: el Tablero (transition,
 * split) y la revisión del parte de WhatsApp (`corrected_data.paper_issue`).
 * Una sola definición para las tres puertas.
 */
import { z } from 'zod';
import type { PaperIssueLine } from '@/lib/paper-issue-server';

export const PaperIssueLineSchema = z.object({
	lot_id: z.string().uuid(),
	sheets: z.coerce.number().int().positive().max(10_000_000),
	override_reason: z.string().max(1000).optional().nullable(),
});

export const PaperIssueSchema = z.array(PaperIssueLineSchema).max(10).optional().nullable();

export type PaperIssuePayload = z.infer<typeof PaperIssueLineSchema>;

export function toPaperIssueLines(raw: PaperIssuePayload[] | null | undefined): PaperIssueLine[] | null {
	if (!raw || raw.length === 0) return null;
	return raw.map((l) => ({ lotId: l.lot_id, sheets: l.sheets, overrideReason: l.override_reason ?? null }));
}

/** Para datos que no pasaron por zod (el JSON de un parte corregido): lo válido, o nada. */
export function parsePaperIssue(raw: unknown): PaperIssueLine[] | null {
	const parsed = PaperIssueSchema.safeParse(raw);
	return parsed.success ? toPaperIssueLines(parsed.data) : null;
}
