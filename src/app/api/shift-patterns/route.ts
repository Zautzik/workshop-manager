import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Patrón de turnos por máquina: qué turnos trabaja NORMALMENTE cada una y qué
 * días (`machine_shift_patterns`, ver `machine-calendar.ts`).
 *
 * Se edita desde Planta y lo usa el Cronograma cuando una máquina no tiene
 * dotación cargada ese día. Abrir una noche puntual NO es cambiar el patrón:
 * es asignar operarios al turno Noche en esa fecha.
 */

// `machine_shift_patterns` llega con la migración 20261027140000 y todavía no
// está en los tipos generados.
const table = () => (supabaseAdmin as any).from('machine_shift_patterns');

export async function GET() {
	const auth = await requireAuth(['admin', 'supervisor', 'manager']);
	if (isAuthError(auth)) return auth;

	const { data, error } = await table().select('machine_id, shift_id, weekdays');
	if (error) {
		// Antes de la migración: no hay patrón, y la pantalla lo dice en vez de romperse.
		return NextResponse.json({ patterns: [], available: false, error: error.message });
	}
	return NextResponse.json({ patterns: data ?? [], available: true });
}

const PutSchema = z.object({
	machine_id: z.string().uuid(),
	shift_id: z.string().uuid(),
	/** Días en que la máquina trabaja ese turno (0 = domingo). Vacío = no lo trabaja. */
	weekdays: z.array(z.number().int().min(0).max(6)).max(7),
});

export async function PUT(req: NextRequest) {
	const auth = await requireAuth(['admin', 'supervisor']);
	if (isAuthError(auth)) return auth;

	const parsed = PutSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors }, { status: 400 });
	}
	const { machine_id, shift_id } = parsed.data;
	const weekdays = [...new Set(parsed.data.weekdays)].sort();

	// Sólo se asigna a una definición vigente, nunca a una fila histórica.
	const { data: shift, error: shiftErr } = await supabaseAdmin.from('shifts').select('*').eq('id', shift_id).maybeSingle();
	if (shiftErr) return NextResponse.json({ error: shiftErr.message }, { status: 500 });
	if (!shift || !(shift as any).code || (shift as any).archived_at) {
		return NextResponse.json({ error: 'Ese turno no es una definición vigente.' }, { status: 400 });
	}

	const { error } =
		weekdays.length === 0
			? await table().delete().eq('machine_id', machine_id).eq('shift_id', shift_id)
			: await table().upsert({ machine_id, shift_id, weekdays }, { onConflict: 'machine_id,shift_id' });
	if (error) {
		console.error('Error saving shift pattern:', error);
		return NextResponse.json({ error: 'No se pudo guardar el patrón de turnos' }, { status: 500 });
	}

	return NextResponse.json({ machine_id, shift_id, weekdays });
}
