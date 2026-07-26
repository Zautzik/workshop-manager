import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Scheduling cost model — the weights and multipliers the planner uses to pick
 * who works where. It was being written browser-direct from PlantaBoard, which
 * meant RLS silently rejected every save under dev-bypass (same class of failure
 * that broke worker assignment). All writes now go through this gated route.
 */
const CostModelSchema = z.object({
  name: z.string().min(1).max(200),
  is_active: z.boolean().optional(),
  cost_weight: z.coerce.number().min(0),
  rating_weight: z.coerce.number().min(0),
  skill_weight: z.coerce.number().min(0),
  overtime_multiplier_50: z.coerce.number().min(0).nullable().optional(),
  overtime_multiplier_100: z.coerce.number().min(0).nullable().optional(),
  night_shift_multiplier: z.coerce.number().min(0).nullable().optional(),
  weekend_multiplier: z.coerce.number().min(0).nullable().optional(),
  minimum_hourly_rate: z.coerce.number().min(0).nullable().optional(),
  maximum_hourly_rate: z.coerce.number().min(0).nullable().optional(),
  rounding_increment: z.coerce.number().gt(0),
  prefer_lower_cost: z.boolean().optional(),
});

/** GET — the active cost model (most recent if several are flagged active). */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { data, error } = await supabaseAdmin
    .from('scheduling_cost_models')
    .select('*')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? null);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();
    const parsed = CostModelSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos del modelo de costos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('scheduling_cost_models')
      .insert(parsed.data)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudo guardar el modelo de costos' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Se requiere un ID de modelo válido' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const parsed = CostModelSchema.partial().safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos del modelo de costos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('scheduling_cost_models')
      .update(parsed.data)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'No se pudo guardar el modelo de costos' }, { status: 500 });
  }
}
