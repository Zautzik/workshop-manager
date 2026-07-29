import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

const ReadingSchema = z.object({
  reading: z.coerce.number().min(0),
  read_at: z.string().datetime().optional(),
  source: z.enum(['manual', 'qr', 'production', 'import']).optional(),
  notes: z.string().max(500).nullable().optional(),
});

/** Historial del contador + ritmo derivado. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager', 'technician']);
  if (isAuthError(auth)) return auth;

  const { id } = await ctx.params;

  const [{ data: machine }, { data: readings }, { data: rate }] = await Promise.all([
    supabaseAdmin
      .from('machines')
      .select('id, name, usage_unit, usage_counter, usage_counter_updated_at')
      .eq('id', id)
      .single(),
    supabaseAdmin
      .from('machine_usage_readings')
      .select('*')
      .eq('machine_id', id)
      .order('read_at', { ascending: false })
      .limit(50),
    supabaseAdmin.from('machine_usage_rate_v').select('*').eq('machine_id', id).maybeSingle(),
  ]);

  if (!machine) return NextResponse.json({ error: 'Máquina no encontrada' }, { status: 404 });

  return NextResponse.json({
    machine,
    readings: readings ?? [],
    rate: rate ?? null,
    // Que la UI pueda decir POR QUÉ no hay proyección, en vez de mostrar un guion.
    rate_reason:
      rate?.uso_por_dia != null
        ? null
        : (readings?.length ?? 0) < 2
          ? 'Hacen falta al menos dos lecturas para calcular el ritmo de uso.'
          : 'Las lecturas están muy juntas en el tiempo para derivar un ritmo confiable.',
  });
}

/**
 * POST — anotar una lectura del contador.
 *
 * No se edita `machines.usage_counter` directo: se agrega una lectura y un
 * trigger sincroniza el contador. Así queda quién anotó qué y cuándo, que es
 * lo que permite auditar una decisión de compra meses después.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager', 'technician']);
  if (isAuthError(auth)) return auth;

  const { id } = await ctx.params;

  try {
    const parsed = ReadingSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Lectura inválida', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data: machine } = await supabaseAdmin
      .from('machines')
      .select('id, usage_unit, usage_counter')
      .eq('id', id)
      .single();

    if (!machine) return NextResponse.json({ error: 'Máquina no encontrada' }, { status: 404 });

    // Un contador que retrocede casi siempre es un error de tipeo. Se acepta
    // igual —los tableros se cambian y el contador vuelve a cero— pero se avisa.
    const previous = Number(machine.usage_counter ?? 0);
    const warning =
      parsed.data.reading < previous
        ? `La lectura (${parsed.data.reading}) es menor que la anterior (${previous}). Se registró igual: si el contador se reinició, corresponde; si fue un error de tipeo, corrígelo con una nueva lectura.`
        : null;

    const { data, error } = await supabaseAdmin
      .from('machine_usage_readings')
      .insert({
        machine_id: id,
        reading: parsed.data.reading,
        unit: machine.usage_unit,
        read_at: parsed.data.read_at ?? new Date().toISOString(),
        source: parsed.data.source ?? 'manual',
        notes: parsed.data.notes ?? null,
      })
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // El trigger acaba de mover machines.usage_counter, y GET /api/machines
    // sirve desde unstable_cache por 5 minutos. Sin esto, el operario anota la
    // lectura, la pantalla sigue mostrando la vieja, y la vuelve a anotar.
    revalidateTag('machines', 'max');

    return NextResponse.json({ reading: data, warning }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudo registrar la lectura' }, { status: 500 });
  }
}
