import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

const OPS = ['admin', 'manager', 'supervisor'] as const;

// GET /api/supplier-categories — the flexible category catalog.
export async function GET(_req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { data, error } = await supabaseAdmin
    .from('supplier_categories' as any)
    .select('*')
    .order('kind', { ascending: true })
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  kind: z.enum(['material', 'service']).optional().nullable(),
});

// POST /api/supplier-categories — create a new category.
export async function POST(req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('supplier_categories' as any)
    .insert({ name: parsed.data.name, kind: parsed.data.kind ?? null } as any)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Esa categoría ya existe' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
