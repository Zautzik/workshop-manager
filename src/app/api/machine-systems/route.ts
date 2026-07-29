import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import type { Database } from '@/integrations/supabase/types';

export const dynamic = 'force-dynamic';

type MachineType = Database['public']['Enums']['machine_type'];

/**
 * Catálogo de sistemas mecánicos — el primer nivel del árbol.
 * `machine_type` filtra a los que aplican a esa clase de máquina: no tiene
 * sentido ofrecerle "sistema de mojado" a una guillotina.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager', 'technician']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const machineType = searchParams.get('machine_type') as MachineType | null;

  const { data, error } = await supabaseAdmin
    .from('machine_systems')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = machineType
    ? (data ?? []).filter((s) => !s.applies_to || s.applies_to.includes(machineType))
    : (data ?? []);

  return NextResponse.json(rows);
}

const SystemSchema = z.object({
  code: z.string().min(2).max(40).regex(/^[a-z_]+$/, 'Sólo minúsculas y guion bajo'),
  name: z.string().min(2).max(120),
  description: z.string().max(500).nullable().optional(),
  applies_to: z.array(z.string()).nullable().optional(),
  sort_order: z.coerce.number().int().optional(),
});

/** Un taller puede tener un sistema que el catálogo base no previó. */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor']);
  if (isAuthError(auth)) return auth;

  try {
    const parsed = SystemSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos del sistema', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('machine_systems')
      .insert({
        ...parsed.data,
        applies_to: (parsed.data.applies_to as MachineType[] | null | undefined) ?? null,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ya existe un sistema con ese código' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudo crear el sistema' }, { status: 500 });
  }
}
