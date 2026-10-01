import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { fetchAll } from '@/lib/fetch-all';

export const dynamic = 'force-dynamic';

const OPS = ['admin', 'manager', 'supervisor'] as const;

// GET /api/captures[?domain=&status=&applied=] — the unified capture inbox.
export async function GET(req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const sp = new URL(req.url).searchParams;
  const domain = sp.get('domain');
  const status = sp.get('status');
  const applied = sp.get('applied');

  let query = supabaseAdmin
    .from('capture_events' as any)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (domain) query = query.eq('domain', domain);
  if (status) query = query.eq('status', status);
  if (applied === 'true') query = query.eq('applied', true);
  if (applied === 'false') query = query.eq('applied', false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Lightweight roll-up for the inbox header (by domain + pending count). Sin
  // límite, esta consulta caía directo en el tope silencioso de 1.000 filas de
  // PostgREST (el mismo defecto que truncó Rentabilidad) — inofensivo con pocos
  // eventos, mentiroso el día que la bandeja acumule más que eso (auditoría
  // 2026-09-30). `fetchAll` pagina hasta agotar y avisa si igual no alcanzó.
  const { rows, truncated } = await fetchAll<{ domain: string; status: string; applied: boolean }>(
    (desde, hasta) =>
      supabaseAdmin
        .from('capture_events' as any)
        .select('domain, status, applied')
        .range(desde, hasta) as any,
  );
  const counts = {
    total: rows.length,
    pending: rows.filter((r) => r.status === 'pending').length,
    applied: rows.filter((r) => r.applied).length,
    production: rows.filter((r) => r.domain === 'production').length,
    warehouse: rows.filter((r) => r.domain === 'warehouse').length,
    truncated,
  };

  return NextResponse.json({ data: data ?? [], counts });
}
