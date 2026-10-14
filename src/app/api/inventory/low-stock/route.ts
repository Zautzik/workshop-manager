import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Alertas de stock bajo — `inventory_low_stock_alerts_v`, lo que falta primero.
 *
 * Se movió del navegador por lo mismo que las otras dos vistas de inventario:
 * una vista pasa por encima de RLS, así que funcionaba y era legible con la
 * publishable key, y la migración 20261014121000 le pone `security_invoker`.
 *
 * ── Esta es la que casi se rompe ───────────────────────────────────────────
 *
 * La migración 20261014121000 se escribió excluyendo las tres vistas que el
 * navegador leía… y esta era una CUARTA. No apareció en el primer barrido
 * porque se consulta como `.from('inventory_low_stock_alerts_v' as any)`, y el
 * `as any` antes del paréntesis dejó fuera al patrón que buscaba
 * `.from('…')`. Aplicar la migración como estaba habría apagado las alertas de
 * quiebre de stock sin que nada fallara: la vista deja de contestar, la
 * pantalla muestra cero alertas, y cero alertas se lee como «no falta nada».
 *
 * Al mudar las cuatro, la migración ya no necesita lista de excepciones.
 */
export async function GET(_req: NextRequest) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor', 'technician']);
	if (isAuthError(auth)) return auth;

	const { data, error, count } = await supabaseAdmin
		.from('inventory_low_stock_alerts_v' as any)
		.select('*', { count: 'exact' })
		.order('shortage', { ascending: false });

	if (error) return NextResponse.json({ error: error.message }, { status: 500 });

	return NextResponse.json({ data: data ?? [], total: count ?? 0 });
}
