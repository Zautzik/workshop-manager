import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { advanceLinkedSchedule } from '@/app/api/maintenance/work-orders/[id]/route';

export const dynamic = 'force-dynamic';

/**
 * El supervisor aprueba mover la fecha de la próxima mantención.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * Cerrar una orden normalmente avanza el reloj de su pauta. Desde la etiqueta
 * QR de la máquina (`/m/<token>`) no hay persona identificada —lo que autoriza
 * es el token impreso—, así que ese cierre registra el trabajo pero NO mueve la
 * fecha: deja la orden en `avance_pendiente` y espera acá.
 *
 * Estirar el intervalo de mantención de un equipo es la clase de cambio que se
 * nota recién cuando la máquina falla antes de lo previsto. Por eso lo firma
 * alguien (decisión del dueño, 2026-10-19).
 *
 * ── Qué hace y qué no ─────────────────────────────────────────────────────
 *
 * Avanza la pauta por `advanceLinkedSchedule`, el mismo camino que usa el cierre
 * con sesión — no una copia que se olvide de leer el contador de la máquina — y
 * deja escrito quién aprobó y cuándo.
 *
 * No reabre la orden, no cambia sus ítems y no toca el trabajo reportado. Lo
 * único que decide es si la fecha se mueve. Rechazar es simplemente no aprobar:
 * la pauta sigue vencida, que es la verdad mientras nadie la haya revisado.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	// Visto bueno de supervisión. Un técnico puede cerrar la orden, no autorizar
	// que la próxima mantención se corra.
	const auth = await requireAuth(['admin', 'manager', 'supervisor']);
	if (isAuthError(auth)) return auth;

	const { id } = await params;
	if (!id || !z.string().uuid().safeParse(id).success) {
		return NextResponse.json({ error: 'Se requiere un ID de orden válido' }, { status: 400 });
	}

	const { data: orden, error: errOrden } = await supabaseAdmin
		.from('maintenance_work_orders')
		.select('id, machine_id, schedule_id, status, completed_at, avance_pendiente' as never)
		.eq('id', id)
		.maybeSingle();

	if (errOrden) return NextResponse.json({ error: errOrden.message }, { status: 500 });
	if (!orden) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });

	const o = orden as Record<string, any>;

	if (!o.avance_pendiente) {
		// Idempotencia honesta: si no hay nada pendiente se dice, en vez de
		// avanzar la pauta una segunda vez y correr la fecha el doble.
		return NextResponse.json(
			{ error: 'Esta orden no tiene un avance de pauta pendiente de aprobación' },
			{ status: 409 },
		);
	}

	if (o.status !== 'completed') {
		return NextResponse.json(
			{ error: 'Sólo se aprueba el avance de una orden ya cerrada' },
			{ status: 409 },
		);
	}

	if (!o.schedule_id) {
		// Sin pauta no hay fecha que mover: se limpia la marca y se termina.
		const { error } = await supabaseAdmin
			.from('maintenance_work_orders')
			.update({ avance_pendiente: false } as never)
			.eq('id', id);
		if (error) return NextResponse.json({ error: error.message }, { status: 500 });
		return NextResponse.json({ data: { avanzada: false, motivo: 'La orden no nació de una pauta' } });
	}

	// Mismo camino que el cierre con sesión.
	await advanceLinkedSchedule({
		schedule_id: o.schedule_id,
		machine_id: o.machine_id,
		completed_at: o.completed_at ?? null,
	});

	const { data, error } = await supabaseAdmin
		.from('maintenance_work_orders')
		.update({
			avance_pendiente: false,
			avance_aprobado_por: auth.id,
			avance_aprobado_en: new Date().toISOString(),
		} as never)
		.eq('id', id)
		.select('id, avance_pendiente, avance_aprobado_por, avance_aprobado_en' as never)
		.single();

	if (error) return NextResponse.json({ error: error.message }, { status: 500 });

	return NextResponse.json({ data: { ...(data as object), avanzada: true } });
}
