import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Comprometer papel con una OT, o soltarlo.
 *
 * Elegir un lote en Compras anotaba de qué lote sale y nada más: otro vendedor
 * podía ofrecer el mismo pallet y otra OT consumirlo primero. El que llegaba
 * segundo se enteraba al escanear, con el trabajo montado.
 *
 * Reservar no toca el saldo físico —el papel sigue ahí— sino lo que se puede
 * PROMETER. Y vence solo: una reserva de un trabajo que se cayó suelta el papel
 * sin que nadie tenga que acordarse.
 */

const Reservar = z.object({
  lot_id: z.string().uuid(),
  ot_id: z.string().uuid(),
  quantity: z.coerce.number().positive(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor', 'vendedor']);
  if (isAuthError(auth)) return auth;

  const parsed = Reservar.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const { data, error } = await supabaseAdmin.rpc('reservar_lote' as never, {
    p_lot_id: parsed.data.lot_id,
    p_ot_id: parsed.data.ot_id,
    p_quantity: parsed.data.quantity,
    p_by: auth.id,
  } as never);

  if (error) {
    // «No hay libre» no es un fallo del sistema: es la respuesta. Se muestra tal
    // cual porque la función ya la escribe en el idioma del taller.
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json({ reserva: data }, { status: 201 });
}

const Liberar = z.object({
  ot_id: z.string().uuid(),
  lot_id: z.string().uuid().nullish(),
  // Igual que anular una OC: una reserva que desaparece sin explicación es
  // indistinguible de un error.
  reason: z.string().min(5, 'Decí por qué se libera.').max(300),
});

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;

  const parsed = Liberar.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin.rpc('liberar_reserva' as never, {
    p_ot_id: parsed.data.ot_id,
    p_lot_id: parsed.data.lot_id ?? null,
    p_motivo: parsed.data.reason,
  } as never);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ liberadas: data });
}
