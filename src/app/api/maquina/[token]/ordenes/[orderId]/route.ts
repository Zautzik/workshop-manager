import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { applyWorkOrderUpdate } from '@/app/api/maintenance/work-orders/[id]/route';

export const dynamic = 'force-dynamic';

/**
 * Actualizar una orden de mantención desde el QR de la máquina, sin sesión.
 *
 * ── Ruta PÚBLICA, y por eso con dos candados propios ──────────────────────
 *
 * 1. El token de la etiqueta tiene que resolver a una máquina.
 * 2. La orden tiene que pertenecer a ESA máquina.
 *
 * El segundo es el que importa: sin él, cualquier etiqueta serviría para cerrar
 * la orden de cualquier máquina pasando otro `orderId`. Es la diferencia entre
 * «el token abre esta máquina» y «el token abre el módulo de mantención».
 *
 * ── Reusa `applyWorkOrderUpdate`, no reimplementa ──────────────────────────
 *
 * Esa función se extrajo del PATCH con sesión justamente para esto, y su propio
 * comentario lo dice: para que otro camino pueda cerrar una orden «por el mismo
 * camino exacto que este endpoint, no uno paralelo que se olvide de alguno de
 * los dos» efectos secundarios (el registro de parada y el avance de la pauta).
 * `whatsapp-maintenance-ingest.ts` ya entra por ahí. Esta ruta es el tercer
 * llamador, y el esquema de validación es el mismo porque es el de esa función.
 *
 * ── El límite de esto, dicho sin adornos ──────────────────────────────────
 *
 * No hay persona identificada. Quien tenga una foto de la etiqueta puede marcar
 * ítems y cerrar órdenes de esa máquina desde cualquier parte, y el registro no
 * dirá quién fue. Son evidencia bajo FSSC 22000. El token acota el daño a una
 * máquina y se puede revocar regenerándolo, pero si hace falta saber QUIÉN, el
 * paso siguiente es pedir la credencial del operario como hace
 * `/api/attendance/clock`. Está anotado en la migración 20261016150000.
 *
 * Por eso esta ruta NO acepta todo lo que acepta el PATCH con sesión: sólo lo
 * que el operario hace frente a la máquina.
 */

const TokenSchema = z.string().uuid();

/**
 * Lo que el QR puede cambiar: arrancar, marcar ítems, cerrar, y dejar una nota.
 *
 * Deliberadamente más angosto que el PATCH con sesión. No se puede reasignar,
 * cambiar prioridad ni reabrir una orden cerrada desde una etiqueta.
 */
const CuerpoSchema = z
	.object({
		status: z.enum(['in_progress', 'completed']).optional(),
		started_at: z.string().optional(),
		completed_at: z.string().optional(),
		actual_minutes: z.coerce.number().min(0).optional(),
		notes: z.string().max(2000).nullable().optional(),
		completed_items: z
			.array(
				z.object({
					item_id: z.string(),
					completed: z.boolean(),
					completed_at: z.string().nullable().optional(),
					estimated_minutes: z.coerce.number().min(0).nullable().optional(),
					label: z.string().optional(),
					section: z.string().nullable().optional(),
					action_type: z.string().nullable().optional(),
				}),
			)
			.optional(),
	})
	.refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

export async function PATCH(
	req: NextRequest,
	{ params }: { params: Promise<{ token: string; orderId: string }> },
) {
	const { token, orderId } = await params;

	if (!TokenSchema.safeParse(token).success || !z.string().uuid().safeParse(orderId).success) {
		return NextResponse.json({ error: 'Etiqueta u orden no válida' }, { status: 404 });
	}

	// 1) El token tiene que resolver a una máquina.
	const { data: maquina, error: errMaquina } = await supabaseAdmin
		.from('machines' as never)
		.select('id, name')
		.eq('qr_token' as never, token as never)
		.maybeSingle();

	if (errMaquina) return NextResponse.json({ error: errMaquina.message }, { status: 500 });
	if (!maquina) return NextResponse.json({ error: 'Etiqueta no válida' }, { status: 404 });

	// 2) La orden tiene que ser de ESA máquina. Sin este chequeo el token sería
	//    una llave del módulo de mantención y no de una máquina.
	const { data: orden, error: errOrden } = await supabaseAdmin
		.from('maintenance_work_orders')
		.select('id, machine_id, status')
		.eq('id', orderId)
		.maybeSingle();

	if (errOrden) return NextResponse.json({ error: errOrden.message }, { status: 500 });
	if (!orden || (orden as any).machine_id !== (maquina as any).id) {
		// Mismo 404 que una etiqueta inexistente: no se confirma que la orden
		// exista si no es de esta máquina.
		return NextResponse.json({ error: 'Esa orden no es de esta máquina' }, { status: 404 });
	}

	// Una orden ya cerrada no se reabre desde una etiqueta.
	if ((orden as any).status === 'completed' || (orden as any).status === 'cancelled') {
		return NextResponse.json(
			{ error: 'Esta orden ya está cerrada. Avisá al supervisor si hay que reabrirla.' },
			{ status: 409 },
		);
	}

	const parsed = CuerpoSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
			{ status: 400 },
		);
	}

	try {
		// Mismo camino que el PATCH con sesión: incluye el registro de parada y el
		// avance de la pauta.
		const data = await applyWorkOrderUpdate(orderId, parsed.data as never);
		return NextResponse.json({ data });
	} catch (err) {
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : 'No se pudo actualizar la orden' },
			{ status: 500 },
		);
	}
}
