import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const MAX_LIMIT = 100;

function sanitizeSearchTerm(raw: string): string {
  return raw
    .replace(/[\\,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// GET /api/search/advanced?q=...&domain=all|ots|clients|employees|inventory&limit=20
export async function GET(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager', 'hr_manager']);
  if (isAuthError(auth)) return auth;

  try {
    const url = req.nextUrl;
    const q = sanitizeSearchTerm((url.searchParams.get('q') ?? '').trim());
    const domain = (url.searchParams.get('domain') ?? 'all').trim();
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), MAX_LIMIT);

    if (!q || q.length < 2) {
      return NextResponse.json({
        ots: [],
        clients: [],
        employees: [],
        inventory: [],
      });
    }

    const searchLike = `%${q}%`;

    const want = {
      ots: domain === 'all' || domain === 'ots',
      clients: domain === 'all' || domain === 'clients',
      employees: domain === 'all' || domain === 'employees',
      inventory: domain === 'all' || domain === 'inventory',
    };

    const otsRes = want.ots
      ? await supabaseAdmin
          .from('ots')
          .select('id, ot_number, client_name, product_name, status, deadline, created_at')
          .or(`ot_number.ilike.${searchLike},client_name.ilike.${searchLike},product_name.ilike.${searchLike}`)
          .order('created_at', { ascending: false })
          .limit(limit)
      : { data: [] as any[] };

    const clientsRes = want.clients
      ? await supabaseAdmin
          .from('clients')
          .select('id, name, rut, contact_name, email, phone')
          .or(`name.ilike.${searchLike},rut.ilike.${searchLike},contact_name.ilike.${searchLike}`)
          .order('name', { ascending: true })
          .limit(limit)
      : { data: [] as any[] };

    const employeesRes = want.employees
      ? await supabaseAdmin
          .from('employees')
          // `employee_number` never existed — real column is `employee_code`
          // (2026-08 audit; same defect as /api/employees/[id]).
          .select('id, full_name, employee_code, department, status, phone, email')
          .or(`full_name.ilike.${searchLike},employee_code.ilike.${searchLike},department.ilike.${searchLike}`)
          .order('full_name', { ascending: true })
          .limit(limit)
      : { data: [] as any[] };

    const inventoryRes = want.inventory
      ? await supabaseAdmin
          .from('inventory_items')
          .select('id, sku, name, category, unit, barcode_value, qr_value, is_active')
          .or(`sku.ilike.${searchLike},name.ilike.${searchLike},barcode_value.ilike.${searchLike}`)
          .order('name', { ascending: true })
          .limit(limit)
      : { data: [] as any[] };

    return NextResponse.json({
      ots: otsRes.data ?? [],
      clients: clientsRes.data ?? [],
      employees: employeesRes.data ?? [],
      inventory: inventoryRes.data ?? [],
    });
  } catch (error) {
    console.error('Error in advanced search:', error);
    return NextResponse.json({ error: 'Failed to execute advanced search' }, { status: 500 });
  }
}
