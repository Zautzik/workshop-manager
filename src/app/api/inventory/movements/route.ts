import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { fetchAll } from '@/lib/fetch-all';

export const dynamic = 'force-dynamic';

/**
 * El libro de movimientos de inventario — `inventory_stock_transactions_v`.
 *
 * Se movió del navegador porque es una VISTA, y una vista pasa por encima de
 * RLS (corre con los permisos de quien la creó): funcionaba, y la podía leer
 * cualquiera con la publishable key. La migración 20261014121000 le pone
 * `security_invoker`, y entonces dejaría de funcionar desde el navegador — así
 * que la lectura se muda antes.
 *
 * ── Se trae TODO, y si no se pudo, se dice ─────────────────────────────────
 *
 * `useInventoryTransactions` usaba `fetchAll` a propósito, y su comentario
 * explica por qué: una consulta sin `.range()` queda expuesta al tope de 1000
 * filas de PostgREST, y en este mismo repositorio eso ya hizo que un margen
 * leyera 82% en vez de 22%. `InventoryManagement.tsx` recorta a 30 días en el
 * navegador para calcular consumo y rotación, así que un libro incompleto da
 * números incompletos sin avisar.
 *
 * Por eso la paginación se mantiene, sólo que del lado del servidor, con el
 * mismo helper. Y `truncated` viaja en la respuesta: si alguna vez el libro
 * pasa el techo de `fetchAll`, el llamador puede decirlo en pantalla en vez de
 * mostrar un número que parece completo. Devolver las páginas que sí llegaron
 * y callarse sería exactamente lo que `fetch-all.ts` existe para evitar.
 */
export async function GET(_req: NextRequest) {
	const auth = await requireAuth(['admin', 'manager', 'supervisor', 'technician']);
	if (isAuthError(auth)) return auth;

	try {
		const { rows, truncated, pages } = await fetchAll<any>((from, to) =>
			supabaseAdmin
				.from('inventory_stock_transactions_v')
				.select('*')
				.order('created_at', { ascending: false })
				.range(from, to),
		);

		return NextResponse.json({ data: rows, total: rows.length, truncated, pages });
	} catch (error) {
		// `fetchAll` propaga el error entero en vez de devolver páginas parciales.
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'No se pudo leer el libro de movimientos' },
			{ status: 500 },
		);
	}
}
