import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { amountCLP, units } from '@/lib/limits';
import { recordCostCorrection, removeCostCorrection } from '@/lib/cost-correction';

/**
 * POST   /api/ots/[id]/cost-corrections  — registra una corrección del costo real
 * DELETE /api/ots/[id]/cost-corrections?line=<id> — quita una corrección
 *
 * La regla vive en `src/lib/cost-correction.ts`: al libro, con motivo, sólo lo
 * que no tiene otro dueño. Reemplaza a `/real-costs`, que escribía en
 * `ot_real_costs` (decisión del dueño, 2026-11-27).
 */

const ROLES = ['admin', 'supervisor', 'manager'] as const;

const BodySchema = z.object({
	reason: z.string().trim().min(3, 'Una corrección necesita su motivo.').max(1000),
	lines: z
		.array(
			z.object({
				category: z.string().min(1).max(40),
				description: z.string().trim().min(1).max(300),
				quantity: units(),
				unit: z.string().max(30).default('unit'),
				unit_cost: amountCLP(),
			}),
		)
		.min(1)
		.max(30),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireAuth([...ROLES]);
	if (isAuthError(auth)) return auth;

	const { id } = await params;
	if (!z.string().guid().safeParse(id).success) {
		return NextResponse.json({ error: 'Se requiere un ID de OT válido' }, { status: 400 });
	}
	const parsed = BodySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors }, { status: 400 });
	}

	const result = await recordCostCorrection(supabaseAdmin, {
		otId: id,
		actorId: auth.id,
		reason: parsed.data.reason,
		lines: parsed.data.lines.map((l) => ({
			category: l.category,
			description: l.description,
			quantity: l.quantity,
			unit: l.unit,
			unitCost: l.unit_cost,
		})),
	});
	if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
	return NextResponse.json({ ids: result.ids }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireAuth(['admin', 'supervisor']);
	if (isAuthError(auth)) return auth;

	const { id } = await params;
	const line = new URL(req.url).searchParams.get('line') ?? '';
	if (!z.string().guid().safeParse(id).success || !z.string().guid().safeParse(line).success) {
		return NextResponse.json({ error: 'Se requieren el ID de la OT y de la corrección' }, { status: 400 });
	}
	const result = await removeCostCorrection(supabaseAdmin, { otId: id, lineId: line });
	if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
	return NextResponse.json({ ok: true });
}
