import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { DEFAULT_COST_CENTER } from '@/types/work-category';

export const dynamic = 'force-dynamic';

const OPS = ['admin', 'manager', 'supervisor'] as const;

async function fetchAll() {
  return supabaseAdmin
    .from('cost_catalog' as any)
    .select('*')
    .order('category', { ascending: true })
    .order('name', { ascending: true });
}

// GET /api/cost-catalog — the shared cost catalog. Lazily seeds from the
// canonical TS defaults on first read (empty table).
export async function GET(_req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  let { data, error } = await fetchAll();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data || data.length === 0) {
    const seed = DEFAULT_COST_CENTER.map((i) => ({
      name: i.name, category: i.category, unit: i.unit,
      unit_cost: i.unit_cost, is_active: i.is_active, notes: i.notes ?? null,
    }));
    const { error: seedErr } = await supabaseAdmin.from('cost_catalog' as any).insert(seed as any);
    if (seedErr) return NextResponse.json({ error: seedErr.message }, { status: 500 });
    ({ data } = await fetchAll());
  }

  return NextResponse.json({ data: data ?? [] });
}

const ItemSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.string().min(1).max(50),
  unit: z.string().min(1).max(20),
  unit_cost: z.coerce.number().min(0),
  is_active: z.boolean().optional().default(true),
  notes: z.string().max(2000).optional().nullable(),
});

// POST /api/cost-catalog — add a cost line.
export async function POST(req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const body = await req.json().catch(() => null);
  const parsed = ItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('cost_catalog' as any)
    .insert(parsed.data as any)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
