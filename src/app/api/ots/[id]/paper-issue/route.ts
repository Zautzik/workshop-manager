import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { isValidStatus } from '@/lib/ot-state-machine';
import { planPaperIssue } from '@/lib/paper-issue-server';

/**
 * GET /api/ots/[id]/paper-issue?to=<estado>&units=<n>
 *
 * ¿Entrar a `to` con `units` unidades saca papel de bodega? ¿Cuántos pliegos,
 * y de qué lotes (el reservado para la OT primero)? Lo leen el Tablero y la
 * revisión del parte para pre-llenar; moveOT hace la misma pregunta para
 * exigirlo, así que lo que se muestra y lo que se exige no discrepan.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireAuth(['admin', 'supervisor', 'manager']);
	if (isAuthError(auth)) return auth;

	const { id } = await params;
	if (!z.string().uuid().safeParse(id).success) {
		return NextResponse.json({ error: 'Se requiere un ID de OT válido' }, { status: 400 });
	}
	const url = new URL(req.url);
	const to = url.searchParams.get('to') ?? '';
	if (!isValidStatus(to)) return NextResponse.json({ error: 'Estado destino inválido' }, { status: 400 });
	const unitsRaw = url.searchParams.get('units');
	const units = unitsRaw != null && unitsRaw !== '' ? Number(unitsRaw) : null;
	if (units != null && !(Number.isFinite(units) && units > 0)) {
		return NextResponse.json({ error: 'Unidades inválidas' }, { status: 400 });
	}

	try {
		return NextResponse.json(await planPaperIssue({ otId: id, toStatus: to, movedUnits: units }));
	} catch (err) {
		console.error('Error planning paper issue:', err);
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : 'No se pudo calcular el papel que sale' },
			{ status: 500 },
		);
	}
}
