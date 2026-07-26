import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Maintenance programs (the machine's manual, turned into a weekly plan).
 *
 * These writes used to run browser-direct from use-maintenance-queries, which
 * additionally short-circuited with `if (isDevBypass) return` — i.e. under dev
 * bypass the UI reported success and nothing was written at all. Going through
 * the API removes both problems: RLS is not in the path and requireAuth is
 * satisfied server-side, so the dev-bypass special case is no longer needed.
 */
const ProgramSchema = z.object({
  name: z.string().min(1).max(255),
  machine_model: z.string().min(1).max(255),
  machine_id: z.string().uuid().nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  source_language: z.string().max(20).optional(),
  manual_source: z.string().max(500).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const parsed = ProgramSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos del programa', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('maintenance_programs')
      .insert({ ...parsed.data, is_active: true })
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudo crear el programa' }, { status: 500 });
  }
}

/** PATCH — edit a program, or retire it with `is_active: false` (soft delete). */
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Se requiere un ID de programa válido' }, { status: 400 });
  }

  try {
    const parsed = ProgramSchema.partial()
      .extend({ is_active: z.boolean().optional() })
      .safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos del programa', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('maintenance_programs')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'No se pudo actualizar el programa' }, { status: 500 });
  }
}
