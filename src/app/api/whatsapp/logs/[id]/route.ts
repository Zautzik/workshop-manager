/**
 * @fileoverview WhatsApp Log detail
 *
 * GET /api/whatsapp/logs/[id] — Get single log detail
 *
 * La revisión (aprobar / rechazar) ya no vive acá: POST /api/captures/review es
 * la única puerta (src/lib/golden-thread.ts).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('whatsapp_production_logs')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Log not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}
