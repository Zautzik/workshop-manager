/**
 * @fileoverview Warehouse Log Detail + Review API
 *
 * GET   /api/whatsapp/warehouse/logs/[id]  — Single log detail
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { requireAuth } from '@/lib/api-middleware';

type Params = { params: Promise<{ id: string }> };

/* ─── GET: Single log ────────────────────────────────────────── */

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('whatsapp_warehouse_logs')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(data);
}

// La revisión (aprobar / rechazar) ya no vive acá: POST /api/captures/review
// es la única puerta (src/lib/golden-thread.ts).
