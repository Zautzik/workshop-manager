/**
 * @fileoverview Warehouse Logs API — List and manual entry
 *
 * GET  /api/whatsapp/warehouse/logs  — List logs with filters
 * POST /api/whatsapp/warehouse/logs  — Manual entry (simulate scan from UI)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { requireAuth } from '@/lib/api-middleware';

/* ─── GET: List warehouse logs ───────────────────────────────── */

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const url = req.nextUrl;
  const status = url.searchParams.get('status');
  const action = url.searchParams.get('action');
  const item_id = url.searchParams.get('item_id');
  const ot_number = url.searchParams.get('ot_number');
  const limit = Math.min(Number(url.searchParams.get('limit') || '50'), 200);
  const offset = Number(url.searchParams.get('offset') || '0');

  let query = supabaseAdmin
    .from('whatsapp_warehouse_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('review_status', status);
  if (action) query = query.eq('action_type', action);
  if (item_id) query = query.eq('item_id', item_id);
  if (ot_number) query = query.eq('ot_number', ot_number);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/* ─── POST: Manual entry ─────────────────────────────────────── */

const ManualEntrySchema = z.object({
  action_type: z.enum(['receive', 'use', 'return', 'check']),
  item_id: z.string().uuid(),
  quantity: z.number().positive().optional(),
  unit: z.string().max(20).optional(),
  unit_cost: z.number().min(0).optional(),
  ot_number: z.string().max(10).regex(/^\d{1,6}$/).optional(),
  lot_id: z.string().uuid().optional(),
  supplier_name: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
  operator_name: z.string().max(100),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = ManualEntrySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Look up item
  const { data: item } = await supabaseAdmin
    .from('inventory_items')
    .select('id, name, sku, unit')
    .eq('id', data.item_id)
    .maybeSingle();

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  // Look up OT if provided
  let otId: string | null = null;
  if (data.ot_number) {
    const { data: otData } = await supabaseAdmin
      .from('ots')
      .select('id')
      .or(`ot_number.eq.${data.ot_number},ot_number.eq.OT-${data.ot_number}`)
      .limit(1)
      .maybeSingle();
    otId = otData?.id ?? null;
  }

  const { data: log, error } = await supabaseAdmin
    .from('whatsapp_warehouse_logs')
    .insert({
      action_type: data.action_type,
      item_id: item.id,
      item_name: item.name,
      item_sku: item.sku,
      lot_id: data.lot_id ?? null,
      ot_number: data.ot_number ?? null,
      ot_id: otId,
      operator_phone: 'manual',
      operator_name: data.operator_name,
      scanned_value: 'manual-entry',
      raw_message: data.notes ?? `Manual: ${data.action_type} ${item.sku}`,
      message_timestamp: new Date().toISOString(),
      quantity: data.quantity ?? null,
      unit: data.unit ?? item.unit,
      unit_cost: data.unit_cost ?? null,
      supplier_name: data.supplier_name ?? null,
      review_status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: log?.id, status: 'created' }, { status: 201 });
}
