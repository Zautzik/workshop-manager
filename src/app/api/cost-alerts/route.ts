import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

const OPS = ['admin', 'manager', 'supervisor'] as const;
const THRESHOLD_KEY = 'cost_overrun_threshold_pct';
const DEFAULT_THRESHOLD = 15;

async function readThreshold(): Promise<number> {
  const { data } = await supabaseAdmin
    .from('app_settings' as any)
    .select('value')
    .eq('key', THRESHOLD_KEY)
    .maybeSingle();
  const v = Number((data as any)?.value);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_THRESHOLD;
}

// GET /api/cost-alerts — OTs whose actual cost exceeds their estimate by ≥ the
// configured threshold, plus the threshold itself.
export async function GET(_req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const threshold = await readThreshold();

  const { data, error } = await supabaseAdmin
    .from('ot_cost_summary' as any)
    .select('ot_id, ot_number, client_name, revenue, estimated_cost, actual_cost');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as Array<{
    ot_id: string; ot_number: string; client_name: string | null;
    revenue: number; estimated_cost: number; actual_cost: number;
  }>;

  const alerts = rows
    .map((r) => {
      const est = Number(r.estimated_cost || 0);
      const act = Number(r.actual_cost || 0);
      const overrun_pct = est > 0 ? ((act - est) / est) * 100 : 0;
      const overrun_amount = act - est;
      return { ...r, overrun_pct, overrun_amount };
    })
    .filter((r) => r.estimated_cost > 0 && r.actual_cost > 0 && r.overrun_pct >= threshold)
    .sort((a, b) => b.overrun_pct - a.overrun_pct);

  return NextResponse.json({ threshold, count: alerts.length, alerts });
}

const PatchSchema = z.object({ threshold: z.coerce.number().min(0).max(500) });

// PATCH /api/cost-alerts — set the overrun threshold (admin/manager).
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager']);
  if (isAuthError(auth)) return auth;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Umbral inválido' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('app_settings' as any)
    .upsert({ key: THRESHOLD_KEY, value: parsed.data.threshold } as any, { onConflict: 'key' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ threshold: parsed.data.threshold });
}
