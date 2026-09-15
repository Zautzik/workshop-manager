import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const OPS = ['admin', 'manager', 'supervisor'] as const;

// GET /api/estimator/calibration-proposals — historial de propuestas, para
// que la compuerta §6.6 deje de vivir sólo en el estado del navegador.
export async function GET(_req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const { data, error } = await supabaseAdmin
    .from('estimator_calibration_proposals' as any)
    .select('*')
    .order('proposed_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

const ChangeSchema = z.object({
  path: z.string().min(1).max(200),
  current_value: z.number(),
  proposed_value: z.number(),
});

const CreateSchema = z.object({
  changes: z.array(ChangeSchema).min(1),
  reason: z.string().min(1).max(4000),
  based_on: z.unknown().optional(),
});

// POST /api/estimator/calibration-proposals — deja escrito qué se quiere
// cambiar y por qué, ANTES de que alguien edite CALIBRATION en el código.
export async function POST(req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const d = parsed.data;

  const { data, error } = await supabaseAdmin
    .from('estimator_calibration_proposals' as any)
    .insert({
      proposed_by: auth.id,
      changes: d.changes,
      reason: d.reason,
      based_on: d.based_on ?? null,
      status: 'pending',
    } as any)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
