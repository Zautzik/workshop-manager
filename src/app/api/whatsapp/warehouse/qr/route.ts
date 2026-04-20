/**
 * @fileoverview Warehouse QR Code Generation API
 *
 * POST /api/whatsapp/warehouse/qr — Generate QR code data for inventory items
 *
 * Returns QR string values ready for rendering into QR codes on the client.
 * The client uses a QR rendering library (e.g. qrcode.react) to display them.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { requireAuth } from '@/lib/api-middleware';
import { encodeWarehouseQR } from '@/lib/warehouse-qr';

const QRRequestSchema = z.object({
  item_ids: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(['receive', 'use', 'return', 'check']).optional(),
  ot_number: z.string().max(10).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = QRRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { item_ids, action, ot_number } = parsed.data;

  // Fetch items
  const { data: items, error } = await supabaseAdmin
    .from('inventory_items')
    .select('id, sku, name')
    .in('id', item_ids)
    .eq('is_active', true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!items || items.length === 0) {
    return NextResponse.json({ error: 'No active items found' }, { status: 404 });
  }

  // Generate QR data
  const qrCodes = items.map((item) =>
    encodeWarehouseQR({
      itemId: item.id,
      itemName: item.name,
      itemSku: item.sku,
      action: action as 'receive' | 'use' | 'return' | 'check' | undefined,
      otNumber: ot_number,
    }),
  );

  return NextResponse.json({
    count: qrCodes.length,
    qr_codes: qrCodes,
  });
}
