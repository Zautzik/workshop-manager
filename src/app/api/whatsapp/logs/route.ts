/**
 * @fileoverview WhatsApp Production Logs API
 *
 * GET  /api/whatsapp/logs         — List all logs (with filters)
 * POST /api/whatsapp/logs         — Manual entry (simulate WA message from UI)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { parseWhatsAppMessage } from '@/lib/whatsapp-parser';
import { inferProductionCosts, type OTContext } from '@/lib/whatsapp-cost-inference';
import type { Json } from '@/integrations/supabase/types';

/* ─── GET: List logs ─────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const url = req.nextUrl;
  const status = url.searchParams.get('status');       // pending, approved, rejected
  const otNumber = url.searchParams.get('ot_number');
  const type = url.searchParams.get('type');           // start, end
  const limit = parseInt(url.searchParams.get('limit') || '100');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  try {
    let query = supabaseAdmin
      .from('whatsapp_production_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('review_status', status as any);
    if (otNumber) query = query.eq('ot_number', otNumber);
    if (type) query = query.eq('message_type', type as any);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching WA logs:', error);
      return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [], total: count ?? 0 });
  } catch (error) {
    console.error('Error in WA logs GET:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/* ─── POST: Manual entry (simulate WhatsApp message from UI) ── */

const ManualEntrySchema = z.object({
  message: z.string().min(1).max(500),
  operator_phone: z.string().max(30).optional().default('manual-entry'),
  operator_name: z.string().max(100).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['supervisor', 'admin', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();
    const parsed = ManualEntrySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { message, operator_phone, operator_name } = parsed.data;

    // Parse the message
    const parseResult = parseWhatsAppMessage(message);

    if (!parseResult.ot_number) {
      return NextResponse.json(
        { error: 'No se encontró número de OT en el mensaje' },
        { status: 400 },
      );
    }

    // Validate OT number format strictly
    if (!/^\d{1,6}$/.test(parseResult.ot_number)) {
      return NextResponse.json(
        { error: 'Formato de OT inválido (debe ser numérico, 1-6 dígitos)' },
        { status: 400 },
      );
    }

    // Look up OT
    let otId: string | null = null;
    let otContext: OTContext | null = null;

    const otNum = parseResult.ot_number;
    const { data: otData } = await supabaseAdmin
      .from('ots')
      .select('id, ot_number, quantity, substrate_type, grammage_gsm, width_cm, height_cm')
      .or(`ot_number.eq.${otNum},ot_number.eq.OT-${otNum}`)
      .limit(1)
      .single();

    if (otData) {
      otId = otData.id;
      otContext = {
        ot_number: otData.ot_number,
        quantity: otData.quantity ?? undefined,
        substrate_type: otData.substrate_type ?? undefined,
        grammage_gsm: otData.grammage_gsm ?? undefined,
      };
    }

    // Handle START
    if (parseResult.message_type === 'start') {
      const { data: log, error } = await supabaseAdmin
        .from('whatsapp_production_logs')
        .insert({
          ot_number: parseResult.ot_number,
          ot_id: otId,
          operator_phone,
          operator_name: operator_name || auth.name || 'Manual',
          message_type: 'start',
          raw_message: message,
          review_status: 'auto_approved',
        })
        .select('*')
        .single();

      if (error) throw error;
      return NextResponse.json(log, { status: 201 });
    }

    // Handle END
    if (parseResult.message_type === 'end' && parseResult.production_data) {
      // Find matching start
      let startLogId: string | null = null;
      let elapsedMinutes: number | null = null;

      const { data: startLog } = await supabaseAdmin
        .from('whatsapp_production_logs')
        .select('id, message_timestamp')
        .eq('ot_number', parseResult.ot_number)
        .eq('message_type', 'start')
        .order('message_timestamp', { ascending: false })
        .limit(1)
        .single();

      if (startLog) {
        startLogId = startLog.id;
        const startTime = new Date(startLog.message_timestamp);
        const endTime = new Date(); // manual entry uses current time
        elapsedMinutes = Number(
          ((endTime.getTime() - startTime.getTime()) / 60000).toFixed(2),
        );
      }

      const inferredCosts = inferProductionCosts(
        parseResult.production_data,
        elapsedMinutes,
        otContext,
      );

      const { data: log, error } = await supabaseAdmin
        .from('whatsapp_production_logs')
        .insert({
          ot_number: parseResult.ot_number,
          ot_id: otId,
          operator_phone,
          operator_name: operator_name || auth.name || 'Manual',
          message_type: 'end',
          raw_message: message,
          parsed_data: parseResult.production_data as unknown as Json,
          inferred_costs: inferredCosts as unknown as Json,
          start_log_id: startLogId,
          elapsed_minutes: elapsedMinutes,
          review_status: 'pending',
        })
        .select('*')
        .single();

      if (error) throw error;
      return NextResponse.json(log, { status: 201 });
    }

    return NextResponse.json(
      { error: 'No se pudo interpretar el mensaje. Use: INICIO OT-1234 o FIN OT-1234 [datos]' },
      { status: 400 },
    );
  } catch (error) {
    console.error('Error in WA manual entry:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
