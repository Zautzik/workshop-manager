import { NextRequest, NextResponse } from 'next/server';

import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { fetchAll } from '@/lib/fetch-all';
import { maquetaLoadByClient, type LostQuoteInput, type MaquetaCost } from '@/lib/maqueta';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics/maqueta-load
 *
 * Cuánto cuesta cada cliente en maquetas antes de aprobar — `maquetaLoadByClient`
 * (src/lib/maqueta.ts) existía, tenía pruebas, y no lo llamaba ninguna pantalla:
 * el mismo patrón que este repositorio lleva meses encontrándose a sí mismo
 * (NOTES.md §11, "la data existe, nadie la consulta"). La especificación de
 * Pre-Prensa (Fase D) lo pedía explícitamente en el panel de rentabilidad por
 * cliente. Encontrado y conectado en la auditoría 2026-08-31.
 *
 * Las vueltas se cuentan de la descripción que `maquetaCostLines` ya escribe
 * («Maqueta — 2ª vuelta: …») — no hay una columna aparte que las cuente, por
 * la misma razón que `ot-spec.ts` prefiere el rastro a una casilla.
 */
export async function GET(_req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager']);
  if (isAuthError(auth)) return auth;

  const { rows: lineas } = await fetchAll<any>((desde, hasta) =>
    supabaseAdmin
      .from('ot_cost_lines')
      .select('ot_id, description, total')
      .eq('ref_type', 'maqueta')
      .range(desde, hasta) as any,
  );

  if (lineas.length === 0) {
    return NextResponse.json({
      porCliente: [],
      diagnostics: { trabajosConMaqueta: 0, reason: 'Ningún trabajo tiene maquetas registradas todavía.' },
    });
  }

  const otIds = [...new Set(lineas.map((l) => l.ot_id))];
  const { data: ots, error } = await supabaseAdmin
    .from('ots')
    .select('id, client_name')
    .in('id', otIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const clientePorOt = new Map((ots ?? []).map((o: any) => [o.id, o.client_name as string]));

  // Por OT primero: las vueltas de un trabajo son las mismas líneas, no se
  // pueden contar por línea sin inflar el número (cada vuelta escribe 2-3).
  const porOt = new Map<string, { rounds: Set<number>; total: number }>();
  for (const l of lineas) {
    const acc = porOt.get(l.ot_id) ?? { rounds: new Set<number>(), total: 0 };
    const n = Number(String(l.description).match(/(\d+)ª vuelta/)?.[1]);
    if (Number.isFinite(n)) acc.rounds.add(n);
    acc.total += Number(l.total ?? 0);
    porOt.set(l.ot_id, acc);
  }

  const filasParaElCalculo: LostQuoteInput[] = [...porOt.entries()]
    .filter(([otId]) => clientePorOt.has(otId))
    .map(([otId, v]) => ({
      otNumber: otId,
      clientName: clientePorOt.get(otId)!,
      abandoned: false,
      quotedPrice: null,
      maqueta: {
        rounds: v.rounds.size,
        total: Math.round(v.total),
        // No usados por `maquetaLoadByClient` (sólo lee rounds/total) — en 0
        // para no inventar un desglose que esta ruta no calculó.
        material: 0, printing: 0, labor: 0, tooling: 0, hours: 0, sheets: 0, perRound: [],
      } satisfies MaquetaCost,
    }));

  return NextResponse.json({
    porCliente: maquetaLoadByClient(filasParaElCalculo),
    diagnostics: { trabajosConMaqueta: filasParaElCalculo.length },
  });
}
