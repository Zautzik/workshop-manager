import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { estimatedHoursFor, firstProblem, validateStageReport } from '@/lib/stage-report';

/**
 * GET /api/ots/[id]/stage-reports — los cierres de etapa de una OT.
 *
 * Las pasadas se CREAN al mover la OT (`/transition`, `/split`) y nunca acá: una
 * pasada suelta, sin un movimiento que la haya causado, sería un dato que nadie
 * puede ubicar en el recorrido del trabajo.
 *
 * Se leen al abrir el cierre de la etapa siguiente: ver que el troquelado tomó
 * seis horas cuando se estimaron dos es el contexto que hace que el número que
 * está por escribirse sea pensado y no un relleno.
 */
export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { id } = await params;
	if (!id || !z.string().uuid().safeParse(id).success) {
		return NextResponse.json({ error: 'Se requiere un ID de OT válido' }, { status: 400 });
	}

	const { data, error } = await supabaseAdmin
		.from('ot_stage_reports')
		.select('id, workflow_step, to_status, hours, units_moved, merma_sheets, waste_notes, issues, observations, created_at')
		.eq('ot_id', id)
		.order('created_at', { ascending: true });

	if (error) {
		console.error('Error fetching OT stage reports:', error);
		return NextResponse.json({ error: 'No se pudieron cargar los cierres de etapa' }, { status: 500 });
	}

	return NextResponse.json(data ?? []);
}

/**
 * PATCH /api/ots/[id]/stage-reports — cerrar una pasada que quedó abierta.
 *
 * Es la puerta que la compuerta de despacho necesita. Decirle a alguien «no
 * podés despachar: falta cerrar el troquelado» sin darle dónde hacerlo es una
 * trampa, no una regla.
 *
 * Acá las horas SÍ son obligatorias, y no es una contradicción con el resto del
 * diseño: mover la tarjeta es una acción cuyo objetivo es otro —el trabajo
 * avanza— y no puede quedar rehén de un dato; cerrar una pasada es una acción
 * cuyo único objetivo ES el dato. Un cierre sin horas no cerraría nada.
 */
const CloseSchema = z.object({
	id: z.string().uuid(),
	hours: z.coerce.number().positive().max(999_999),
	merma_sheets: z.coerce.number().int().min(0).optional().nullable(),
	waste_notes: z.string().max(2000).optional().nullable(),
	issues: z.string().max(2000).optional().nullable(),
	observations: z.string().max(2000).optional().nullable(),
});

export async function PATCH(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const auth = await requireAuth(['admin', 'supervisor', 'manager', 'technician']);
	if (isAuthError(auth)) return auth;

	const { id } = await params;
	if (!id || !z.string().uuid().safeParse(id).success) {
		return NextResponse.json({ error: 'Se requiere un ID de OT válido' }, { status: 400 });
	}

	const parsed = CloseSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
			{ status: 400 },
		);
	}
	const d = parsed.data;

	// La pasada tiene que existir, ser de ESTA OT y estar abierta. Lo tercero es
	// lo que impide reescribir una hora ya declarada: el registro es evidencia y
	// una evidencia corregible a mano deja de serlo. Para arreglar un número mal
	// puesto está el retroceso, que deja su propio rastro.
	const { data: pass } = await supabaseAdmin
		.from('ot_stage_reports')
		.select('id, workflow_step, hours')
		.eq('id', d.id)
		.eq('ot_id', id)
		.maybeSingle();

	if (!pass) {
		return NextResponse.json({ error: 'Esa pasada no existe en esta OT.' }, { status: 404 });
	}
	if (pass.hours != null) {
		return NextResponse.json(
			{ error: 'Esa pasada ya estaba cerrada.', code: 'YA_CERRADA' },
			{ status: 409 },
		);
	}

	// El mismo juez que en el tablero: los pliegos del trabajo dicen si la merma
	// es el arreglo o un problema, y lo estimado ataja el 40 escrito donde se
	// esperaba un 4.
	const { data: ot } = await supabaseAdmin
		.from('ots')
		.select('calc_sheets, calc_print_hours, calc_finish_hours')
		.eq('id', id)
		.maybeSingle();

	const check = validateStageReport(
		{
			hours: d.hours,
			mermaSheets: d.merma_sheets ?? null,
			wasteNotes: d.waste_notes ?? null,
			issues: d.issues ?? null,
			observations: d.observations ?? null,
		},
		{
			enteredSheets: ot?.calc_sheets ?? null,
			estimatedHours: ot ? estimatedHoursFor(pass.workflow_step, ot) : null,
		},
	);
	if (!check.ok) {
		return NextResponse.json(
			{ error: firstProblem(check), code: 'CIERRE_INVALIDO' },
			{ status: 400 },
		);
	}

	// `.is('hours', null)` otra vez en el UPDATE, no sólo en la lectura: entre
	// una y otro puede haber entrado el parte de WhatsApp del operario, y el que
	// llega segundo no debe pisar al primero.
	const { data: updated, error } = await supabaseAdmin
		.from('ot_stage_reports')
		.update({
			hours: d.hours,
			merma_sheets: d.merma_sheets ?? null,
			waste_notes: d.waste_notes?.trim() || null,
			issues: d.issues?.trim() || null,
			observations: d.observations?.trim() || null,
			recorded_by: auth.id,
		})
		.eq('id', d.id)
		.is('hours', null)
		.select('id, workflow_step, hours')
		.maybeSingle();

	if (error) {
		console.error('Error closing OT stage pass:', error);
		return NextResponse.json({ error: 'No se pudo cerrar la pasada' }, { status: 500 });
	}
	if (!updated) {
		return NextResponse.json(
			{ error: 'Alguien cerró esa pasada mientras la completabas.', code: 'YA_CERRADA' },
			{ status: 409 },
		);
	}

	return NextResponse.json(updated);
}
