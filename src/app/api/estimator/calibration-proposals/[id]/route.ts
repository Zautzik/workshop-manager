import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const OPS = ['admin', 'manager', 'supervisor'] as const;

const UpdateSchema = z.object({
  status: z.enum(['applied', 'rejected']),
  // Para 'applied': dónde quedó el cambio real (commit, PR, o simplemente
  // "editado a mano en prod el 15-09"). Es lo que conecta la propuesta con el
  // código que efectivamente cambió — sin esto, "aplicada" es una etiqueta sin
  // rastro, el mismo defecto que se está corrigiendo.
  applied_note: z.string().max(2000).optional().nullable(),
});

// PATCH /api/estimator/calibration-proposals/[id] — marca una propuesta como
// aplicada (después de editar CALIBRATION a mano y desplegar) o rechazada.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const d = parsed.data;

  if (d.status === 'applied' && !d.applied_note?.trim()) {
    return NextResponse.json(
      { error: 'Indica dónde quedó el cambio (commit, PR o cómo se aplicó).' },
      { status: 422 }
    );
  }

  // .single() lanza error (no null) cuando cero filas calzan — que es
  // exactamente el caso «ya resuelta» que queremos distinguir de un 500 real.
  // .maybeSingle() lo deja en `data`.
  const { data, error } = await supabaseAdmin
    .from('estimator_calibration_proposals' as any)
    .update({
      status: d.status,
      applied_by: auth.id,
      applied_at: new Date().toISOString(),
      applied_note: d.applied_note?.trim() || null,
    } as any)
    .eq('id', id)
    .eq('status', 'pending') // no reabre una ya resuelta
    .select('*')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Ya estaba resuelta, o no existe.' }, { status: 409 });

  return NextResponse.json({ data });
}
