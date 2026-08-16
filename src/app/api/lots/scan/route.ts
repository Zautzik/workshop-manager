import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { decodeLotQR } from '@/lib/traceability';

export const dynamic = 'force-dynamic';

/**
 * Escanear un lote y consumirlo contra una OT.
 *
 * Es el momento en que el papel deja de ser inventario y pasa a ser producto —
 * de Bodega a Primer Corte o a Impresión. Hasta hoy ese salto no dejaba rastro:
 * el papel se movía y el sistema se enteraba después, o nunca.
 *
 * ── Por qué el trabajo lo hace la base ──────────────────────────────────────
 *
 * `consumir_lote` verifica retención, saldo y certificado, descuenta y deja la
 * traza en una sola transacción. Separarlo en pasos desde acá permitiría que
 * exista un consumo sin verificación —bastaría una llamada a medias— y ese es
 * exactamente el agujero que no puede existir en un sistema certificado.
 *
 * Esta ruta hace lo que la base no puede: entender lo que llegó del lector.
 */

const Schema = z.object({
  /** Lo que leyó la cámara. Crudo: acá se interpreta. */
  qr: z.string().min(1).max(500),
  ot_id: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  /** Dónde se está consumiendo: 'primer_corte', 'impresion', … */
  stage: z.string().max(60).optional().nullable(),
  /** Autorización escrita para una desviación de certificado. */
  override_reason: z.string().max(500).optional().nullable(),
});

export async function POST(req: NextRequest) {
  // Quien consume es el operario de planta: si el rol no lo incluye, el
  // registro se hace desde otro lado y vuelve a perderse el momento real.
  const auth = await requireAuth(['admin', 'manager', 'supervisor', 'technician']);
  if (isAuthError(auth)) return auth;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }
  const d = parsed.data;

  // El lector entrega texto, no un lote. Traducirlo acá y no en la base deja
  // los mensajes en el idioma del operario: «ese es un código de máquina» sirve
  // mucho más que «no encontrado».
  const leido = decodeLotQR(d.qr);
  if (!leido.ok || !leido.lotId) {
    return NextResponse.json({ error: leido.problem, code: 'QR_ILEGIBLE' }, { status: 422 });
  }

  const { data, error } = await supabaseAdmin.rpc('consumir_lote' as never, {
    p_lot_id: leido.lotId,
    p_ot_id: d.ot_id,
    p_quantity: d.quantity,
    p_by: auth.id,
    p_stage: d.stage ?? null,
    p_override_reason: d.override_reason ?? null,
  } as never);

  if (error) {
    // Los mensajes de la función están escritos para mostrarse tal cual: dicen
    // qué pasó y qué falta. Se distingue el caso que se destraba con una
    // autorización del que no, porque la pantalla ofrece cosas distintas.
    const necesitaAutorizacion = /autorizaci[óo]n/i.test(error.message);
    return NextResponse.json(
      { error: error.message, code: necesitaAutorizacion ? 'NECESITA_AUTORIZACION' : 'RECHAZADO' },
      { status: 422 }
    );
  }

  return NextResponse.json({ consumo: data }, { status: 201 });
}
