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
import { processMessage } from '@/lib/whatsapp-ingest';

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
  // "Mis reportes" (OperatorWhatsAppView) pedía esto sin filtro -- con
  // review_status legible para cualquier autenticado, mostraba los últimos
  // 30 mensajes de TODO el taller, no los del operador que abrió la
  // pantalla. `mine=1` resuelve el teléfono de quien pide vía su ficha de
  // empleado (employees.user_id = auth.id) y filtra por operator_phone.
  const mineOnly = url.searchParams.get('mine') === '1';

  try {
    let query = supabaseAdmin
      .from('whatsapp_production_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('review_status', status as any);
    if (otNumber) query = query.eq('ot_number', otNumber);
    if (type) query = query.eq('message_type', type as any);

    if (mineOnly) {
      const { data: employee } = await supabaseAdmin
        .from('employees')
        .select('phone')
        .eq('user_id', auth.id)
        .maybeSingle();

      // Sin teléfono en la ficha no hay nada que buscar -- una lista vacía
      // es la respuesta honesta, no "todos los mensajes" ni un error.
      if (!employee?.phone) {
        return NextResponse.json({ data: [], total: 0 });
      }
      query = query.eq('operator_phone', employee.phone);
    }

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

  const parsed = ManualEntrySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }
  const { message, operator_phone, operator_name } = parsed.data;

  // El mismo camino que el webhook de Meta y el simulador. Antes esta ruta era
  // un tercer pipeline: parseaba un solo evento (no los mensajes compuestos),
  // buscaba la OT por su cuenta, insertaba sin la llave de idempotencia y
  // tarifaba con su propia copia de la inferencia (auditoría 2026-11-05).
  const result = await processMessage({ from: operator_phone, body: message, ProfileName: operator_name });
  return NextResponse.json(result.payload, { status: result.status, headers: result.headers });
}
