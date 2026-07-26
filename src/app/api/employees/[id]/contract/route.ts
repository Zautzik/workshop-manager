import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, hasRole, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Update a person's employment contract.
 *
 * Same gap the compensation route had: a contract could be created when someone
 * was hired and never corrected afterwards. A typo in the weekly hours, a move
 * from part-time to full-time, or the overtime clause changing all needed a
 * trip to the SQL console.
 *
 * The column is `base_hours_per_week` — the API speaks `hours_per_week` because
 * that is what the read side aliases it to, and getting this wrong is exactly
 * what silently created contract-less employees before (2026-07 audit).
 */
const ContractSchema = z.object({
  contract_type: z.enum(['full_time', 'part_time', 'contractor', 'temporary', 'intern']).optional(),
  hours_per_week: z.coerce.number().min(1).max(80).optional(),
  overtime_allowed: z.boolean().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  if (!hasRole(auth.role, ['admin', 'hr_manager'])) {
    return NextResponse.json(
      { error: 'Solo administración o RRHH puede cambiar un contrato' },
      { status: 403 }
    );
  }

  const { id } = await params;
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Se requiere un ID de empleado válido' }, { status: 400 });
  }

  try {
    const parsed = ContractSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos del contrato', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { hours_per_week, ...rest } = parsed.data;
    const patch: Record<string, unknown> = { ...rest };
    if (hours_per_week != null) patch.base_hours_per_week = hours_per_week;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No hay nada que actualizar' }, { status: 400 });
    }

    // The contract in force is the open one; fall back to the most recent.
    const { data: existing } = await supabaseAdmin
      .from('employment_contracts')
      .select('id, end_date, start_date')
      .eq('employee_id', id)
      .order('start_date', { ascending: false });

    const current = (existing ?? []).find((c) => !c.end_date) ?? (existing ?? [])[0];

    if (!current) {
      const { data, error } = await supabaseAdmin
        .from('employment_contracts')
        .insert({
          employee_id: id,
          contract_type: parsed.data.contract_type ?? 'full_time',
          base_hours_per_week: hours_per_week ?? 45,
          overtime_allowed: parsed.data.overtime_allowed ?? false,
          start_date: parsed.data.start_date ?? new Date().toISOString().split('T')[0],
        })
        .select('*')
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, created: true, data }, { status: 201 });
    }

    const { data, error } = await supabaseAdmin
      .from('employment_contracts')
      .update(patch)
      .eq('id', current.id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch {
    return NextResponse.json({ error: 'No se pudo actualizar el contrato' }, { status: 500 });
  }
}
