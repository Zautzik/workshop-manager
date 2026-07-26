import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, hasRole, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Update a person's compensation rate.
 *
 * This was genuinely missing: `/api/employees` can create a rate when someone is
 * hired, and `PUT /api/employees/[id]` explicitly refuses compensation fields —
 * so a rate, once set, could never be changed through the app. "Retribución"
 * could show a wage but not correct one.
 *
 * Money is CLP everywhere and stored as whole pesos; fractions live in the
 * costing calculations, not in the database.
 */
const CompensationSchema = z.object({
  hourly_rate: z.coerce.number().min(0),
  overtime_multiplier_50: z.coerce.number().min(1).optional(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  // Wages are sensitive: same gate the read side uses.
  if (!hasRole(auth.role, ['admin', 'hr_manager'])) {
    return NextResponse.json(
      { error: 'Solo administración o RRHH puede cambiar una tarifa' },
      { status: 403 }
    );
  }

  const { id } = await params;
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Se requiere un ID de empleado válido' }, { status: 400 });
  }

  try {
    const parsed = CompensationSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const patch = {
      hourly_rate: Math.round(parsed.data.hourly_rate),
      currency_code: 'CLP',
      ...(parsed.data.overtime_multiplier_50 != null
        ? { overtime_multiplier_50: parsed.data.overtime_multiplier_50 }
        : {}),
      ...(parsed.data.effective_from ? { effective_from: parsed.data.effective_from } : {}),
    };

    // The rate in force is the open one (no effective_to); fall back to the most
    // recent if every row has been closed off.
    const { data: existing } = await supabaseAdmin
      .from('compensation_rates')
      .select('id, effective_to, effective_from')
      .eq('employee_id', id)
      .order('effective_from', { ascending: false });

    const current = (existing ?? []).find((r) => !r.effective_to) ?? (existing ?? [])[0];

    if (!current) {
      const { data, error } = await supabaseAdmin
        .from('compensation_rates')
        .insert({
          employee_id: id,
          ...patch,
          effective_from: parsed.data.effective_from ?? new Date().toISOString().split('T')[0],
        })
        .select('*')
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, created: true, data }, { status: 201 });
    }

    const { data, error } = await supabaseAdmin
      .from('compensation_rates')
      .update(patch)
      .eq('id', current.id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch {
    return NextResponse.json({ error: 'No se pudo actualizar la tarifa' }, { status: 500 });
  }
}
