import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
	approvalState,
	approvalSummary,
	nextRound,
	validateApproval,
	type ApprovalRow,
} from '@/lib/approval';

export const dynamic = 'force-dynamic';

/**
 * El visto bueno de una OT.
 *
 * Es el único artefacto de la aplicación que traslada responsabilidad: si el
 * cliente aprobó una errata, la reimpresión es suya. Durante meses se guardó
 * como `signed_by_name: 'Cliente'` — que frente a un reclamo no dice quién, no
 * dice qué versión y no dice desde dónde.
 *
 * Tres cosas las pone el SERVIDOR y no el formulario, porque son justamente las
 * que un cliente podría querer discutir después: la vuelta, el reloj y la IP.
 */

const CuerpoSchema = z.object({
	decision: z.enum(['approved', 'rejected']),
	confirmedVia: z.enum(['correo', 'whatsapp', 'telefono', 'presencial', 'portal']),
	approverName: z.string().max(120).nullish(),
	approverEmail: z.string().max(160).nullish(),
	approverRole: z.string().max(80).nullish(),
	proofedOn: z.enum(['pdf', 'prueba_fisica', 'maqueta']).nullish(),
	rejectReason: z.enum(['texto', 'color', 'estructura', 'otro']).nullish(),
	comments: z.string().max(2000).nullish(),
	/** Huella del archivo aprobado. Sin ella, «nos aprobaron otra versión» es
	 *  indefendible — pero no se exige todavía: `ot_attachments` está vacía y
	 *  bloquear por eso dejaría al taller sin poder aprobar nada. */
	fileSha256: z.string().max(64).nullish(),
});

const COLUMNAS =
	'id, ot_id, decision, round, approver_name, approver_email, approver_role, ' +
	'decided_at, reject_reason, proofed_on, file_sha256, comments, created_at, ' +
	'confirmed_via, recorded_by';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor', 'vendedor']);
	if (isAuthError(auth)) return auth;
	const { id } = await params;

	const { data, error } = await supabaseAdmin
		.from('ot_approvals')
		.select(COLUMNAS)
		.eq('ot_id', id)
		.order('round', { ascending: true });

	if (error) return NextResponse.json({ error: error.message }, { status: 500 });

	const estado = approvalState((data ?? []) as unknown as ApprovalRow[]);
	return NextResponse.json({
		approvals: data ?? [],
		estado,
		resumen: approvalSummary(estado),
	});
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	// El vendedor es quien marca: es el eslabón con el cliente y el responsable
	// de que lo registrado sea exacto. Por eso el rol entra acá.
	const auth = await requireAuth(['admin', 'manager', 'supervisor', 'vendedor']);
	if (isAuthError(auth)) return auth;
	const { id } = await params;

	const parsed = CuerpoSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: 'Cuerpo inválido', detalles: parsed.error.issues }, { status: 400 });
	}

	// Las mismas reglas que aplica el formulario, aplicadas de nuevo acá. No es
	// duplicación: la pantalla interna no va a ser la única puerta —el enlace
	// público de seguimiento va a escribir por esta misma ruta.
	const errores = validateApproval(parsed.data);
	if (errores.length > 0) {
		return NextResponse.json({ error: errores[0].message, errores }, { status: 422 });
	}

	const { data: previas, error: errorPrevias } = await supabaseAdmin
		.from('ot_approvals')
		.select('round, decision')
		.eq('ot_id', id);
	if (errorPrevias) return NextResponse.json({ error: errorPrevias.message }, { status: 500 });
	const anteriores = (previas ?? []) as unknown as ApprovalRow[];

	const { data: ot } = await supabaseAdmin.from('ots').select('vb_id').eq('id', id).maybeSingle();

	// La IP es lo que distingue una aprobación de una afirmación. Detrás de un
	// proxy la real es la primera de la cadena.
	const cadena = req.headers.get('x-forwarded-for') ?? '';
	const ip = cadena.split(',')[0]?.trim() || null;

	const fila = {
		ot_id: id,
		vb_id: (ot as { vb_id?: string | null } | null)?.vb_id ?? null,
		decision: parsed.data.decision,
		// La vuelta la cuenta el servidor. Si la mandara el formulario, dos
		// pestañas abiertas escribirían la misma y la restricción única las
		// rechazaría sin explicar por qué.
		round: nextRound(anteriores),
		// El contacto del cliente si el vendedor lo sabe; nulo si no. Un vacío dice
		// «no se sabe» y es más honesto que rellenar.
		approver_name: parsed.data.approverName?.trim() || null,
		confirmed_via: parsed.data.confirmedVia,
		approver_email: parsed.data.approverEmail?.trim() || null,
		approver_role: parsed.data.approverRole?.trim() || null,
		proofed_on: parsed.data.proofedOn ?? null,
		reject_reason: parsed.data.rejectReason ?? null,
		comments: parsed.data.comments?.trim() || null,
		file_sha256: parsed.data.fileSha256 || null,
		// Reloj del servidor, nunca el del navegador de quien aprueba.
		decided_at: new Date().toISOString(),
		source_ip: ip,
		status: parsed.data.decision === 'approved' ? 'approved' : 'rejected',
		resolved_at: new Date().toISOString(),
		// El corazón del registro: QUÉ VENDEDOR lo marcó. El cliente no tiene
		// cuenta, así que esto no es su firma — es la declaración de una persona
		// identificada que responde por su exactitud. `approver_id` queda nulo
		// porque apunta a `auth.users` y llenarlo con el vendedor diría que
		// aprobó alguien que no aprobó.
		recorded_by: auth.id,
		requested_by: auth.id,
	};

	const { data: creada, error } = await supabaseAdmin
		.from('ot_approvals')
		.insert(fila as never)
		.select(COLUMNAS)
		.single();

	if (error) {
		// La restricción única de (ot_id, round) es la que se rompe cuando dos
		// personas aprueban a la vez. Merece un mensaje y no un 500 genérico.
		const conflicto = error.code === '23505';
		return NextResponse.json(
			{
				error: conflicto
					? 'Alguien más registró una decisión para esta vuelta hace un momento. Recargá para verla.'
					: error.message,
			},
			{ status: conflicto ? 409 : 500 },
		);
	}

	const todas = [...anteriores, creada as unknown as ApprovalRow];
	const estado = approvalState(todas);

	return NextResponse.json({ approval: creada, estado, resumen: approvalSummary(estado) }, { status: 201 });
}
