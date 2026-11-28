import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { buildRateLimitActor, enforceRouteRateLimit } from '@/lib/api-rate-limit';
import { cancelOT, cancelPreview } from '@/lib/ot-cancel-server';

const CancelSchema = z.object({
  // Como al anular una OC: una OT que desaparece sin explicación es
  // indistinguible de un error.
  reason: z.string().trim().min(5, 'Decí por qué se cancela la OT.').max(500),
  // El papel que vuelve a bodega, en pliegos, lote por lote. Lo que no se
  // declara no vuelve: queda como costo real de la OT.
  returns: z
    .array(z.object({ lot_id: z.string().uuid(), sheets: z.coerce.number().int().min(0).max(10_000_000) }))
    .max(50)
    .optional()
    .default([]),
});

const idOk = (id: string) => z.string().uuid().safeParse(id).success;

/**
 * GET /api/ots/[id]/cancel
 *
 * Lo que el diálogo necesita para preguntar: si la OT se puede cancelar y qué
 * papel tiene afuera, lote por lote. No escribe nada.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;
  const { id } = await params;
  if (!idOk(id)) return NextResponse.json({ error: 'Se requiere un ID de OT válido' }, { status: 400 });

  const preview = await cancelPreview(id);
  if (!preview.ok) return NextResponse.json({ error: preview.error }, { status: preview.status });
  return NextResponse.json(preview);
}

/**
 * POST /api/ots/[id]/cancel
 *
 * Cancela la OT: sale del flujo conservando el estado en el que estaba, el
 * papel declarado vuelve a bodega y sus reservas quedan libres. El trabajo ya
 * hecho (horas, mano de obra, costos cargados) no se toca (ot-cancel-server.ts).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const rl = enforceRouteRateLimit({
    req,
    key: `ots:${buildRateLimitActor(req, auth.id)}:cancel`,
    limit: 10,
    windowMs: 60_000,
    message: 'Demasiadas cancelaciones seguidas. Esperá un momento.',
  });
  if (rl) return rl;

  const { id } = await params;
  if (!idOk(id)) return NextResponse.json({ error: 'Se requiere un ID de OT válido' }, { status: 400 });

  const parsed = CancelSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
  }

  const result = await cancelOT({
    otId: id,
    reason: parsed.data.reason,
    returns: parsed.data.returns.map((r) => ({ lotId: r.lot_id, sheets: r.sheets })),
    actor: { id: auth.id, role: auth.role! },
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const { warnings, ...rest } = result;
  return NextResponse.json(warnings.length > 0 ? { ...rest, warning: warnings.join(' ') } : rest);
}
