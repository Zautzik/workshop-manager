import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * El tablero de planta — `planta_live`: máquinas con su OT, su gente y sus
 * alertas de insumo.
 *
 * `usePlantaLive` la leía directo desde el navegador y se refresca cada 30 s.
 * Es una vista, así que pasaba por encima de RLS: funcionaba, y era legible por
 * cualquiera con la publishable key — el estado completo de la planta, qué
 * máquina está corriendo qué trabajo y con quién. La migración 20261014121000
 * le pone `security_invoker`, que la dejaría muda desde el navegador, así que la
 * lectura se muda antes.
 *
 * El rol es el conjunto operativo: este tablero lo mira el taller, no sólo
 * administración.
 */
export async function GET(_req: NextRequest) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor', 'technician']);
	if (isAuthError(auth)) return auth;

	const { data, error } = await supabaseAdmin.from('planta_live').select('*');

	// El error se devuelve. Un tablero de planta vacío porque la consulta falló
	// se lee igual que una planta detenida, y son cosas muy distintas.
	if (error) return NextResponse.json({ error: error.message }, { status: 500 });

	return NextResponse.json({ data: data ?? [] });
}
