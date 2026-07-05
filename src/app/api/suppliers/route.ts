import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

const OPS = ['admin', 'manager', 'supervisor'] as const;

export interface SupplierCertification {
  name: string;
  code?: string | null;
  expires_on?: string | null;
}

interface Supplier {
  supplier: string;
  supplier_rut: string | null;
  supplier_giro: string | null;
  email: string | null;
  phone: string | null;
  oc_count: number;
  total_spend: number;
  open_count: number;
  last_purchase_date: string | null;
  category_ids: string[];
  categories: string[];
  certifications: SupplierCertification[];
  has_profile: boolean;
}

function blank(name: string): Supplier {
  return {
    supplier: name, supplier_rut: null, supplier_giro: null, email: null, phone: null,
    oc_count: 0, total_spend: 0, open_count: 0, last_purchase_date: null,
    category_ids: [], categories: [], certifications: [], has_profile: false,
  };
}

// GET /api/suppliers — union of purchases aggregates + editable profiles.
export async function GET(_req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const [{ data: pData, error: pErr }, { data: profs }, { data: cats }] = await Promise.all([
    supabaseAdmin.from('purchases' as any).select('supplier, supplier_rut, supplier_giro, total_cost, purchase_date, status'),
    supabaseAdmin.from('supplier_profiles' as any).select('*'),
    supabaseAdmin.from('supplier_categories' as any).select('id, name'),
  ]);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const rows = (pData ?? []) as unknown as Array<{
    supplier: string; supplier_rut: string | null; supplier_giro: string | null;
    total_cost: number; purchase_date: string | null; status: string;
  }>;
  const profiles = (profs ?? []) as unknown as Array<{
    supplier_name: string; rut: string | null; giro: string | null; email: string | null; phone: string | null;
    category_ids: string[]; certifications: SupplierCertification[];
  }>;
  const catName = new Map((cats ?? [] as any[]).map((c: any) => [c.id, c.name]));

  const byName = new Map<string, Supplier>();
  for (const r of rows) {
    const key = (r.supplier || 'Sin proveedor').trim();
    const s = byName.get(key) ?? blank(key);
    s.oc_count += 1;
    s.total_spend += Number(r.total_cost || 0);
    if (!['closed', 'cancelled'].includes(r.status)) s.open_count += 1;
    if (r.supplier_rut && !s.supplier_rut) s.supplier_rut = r.supplier_rut;
    if (r.supplier_giro && !s.supplier_giro) s.supplier_giro = r.supplier_giro;
    if (r.purchase_date && (!s.last_purchase_date || r.purchase_date > s.last_purchase_date)) s.last_purchase_date = r.purchase_date;
    byName.set(key, s);
  }

  // Overlay + include profile-only suppliers (created, no OCs yet).
  for (const p of profiles) {
    const s = byName.get(p.supplier_name) ?? blank(p.supplier_name);
    s.has_profile = true;
    s.category_ids = p.category_ids ?? [];
    s.categories = (p.category_ids ?? []).map((id) => catName.get(id)).filter(Boolean) as string[];
    s.certifications = p.certifications ?? [];
    if (p.rut) s.supplier_rut = p.rut;
    if (p.giro) s.supplier_giro = p.giro;
    s.email = p.email ?? null;
    s.phone = p.phone ?? null;
    byName.set(p.supplier_name, s);
  }

  const suppliers = [...byName.values()].sort((a, b) => b.total_spend - a.total_spend || a.supplier.localeCompare(b.supplier));
  const totals = {
    count: suppliers.length,
    spend: suppliers.reduce((a, s) => a + s.total_spend, 0),
    open: suppliers.reduce((a, s) => a + s.open_count, 0),
    pefc: suppliers.filter((s) => s.certifications.some((c) => /pefc/i.test(c.name))).length,
  };
  return NextResponse.json({ data: suppliers, totals });
}

const ProfileFields = {
  rut: z.string().max(50).optional().nullable(),
  giro: z.string().max(255).optional().nullable(),
  email: z.string().email().max(255).optional().nullable().or(z.literal('')),
  phone: z.string().max(50).optional().nullable(),
  category_ids: z.array(z.string().uuid()).optional(),
  certifications: z.array(z.object({
    name: z.string().min(1).max(100),
    code: z.string().max(100).optional().nullable(),
    expires_on: z.string().optional().nullable(),
  })).optional(),
};

const CreateSchema = z.object({ supplier_name: z.string().min(1).max(255), ...ProfileFields });
const UpdateSchema = z.object({
  current_name: z.string().min(1).max(255),
  supplier_name: z.string().min(1).max(255),
  ...ProfileFields,
});

function cleanProfile(d: Record<string, any>) {
  const out: Record<string, unknown> = {};
  for (const k of ['rut', 'giro', 'email', 'phone', 'category_ids', 'certifications']) {
    if (d[k] !== undefined) out[k] = d[k] === '' ? null : d[k];
  }
  return out;
}

// POST /api/suppliers — create a new supplier (profile).
export async function POST(req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('supplier_profiles' as any)
    .insert({ supplier_name: parsed.data.supplier_name, ...cleanProfile(parsed.data) } as any)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Ya existe un proveedor con ese nombre' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}

// PATCH /api/suppliers — edit a supplier; a rename propagates to purchases so
// the OC history stays linked.
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  const d = parsed.data;

  if (d.current_name !== d.supplier_name) {
    // Propagate the rename to OC history + move any existing profile row.
    await supabaseAdmin.from('purchases' as any).update({ supplier: d.supplier_name } as any).eq('supplier', d.current_name);
    await supabaseAdmin.from('supplier_profiles' as any).update({ supplier_name: d.supplier_name } as any).eq('supplier_name', d.current_name);
  }

  const { data, error } = await supabaseAdmin
    .from('supplier_profiles' as any)
    .upsert({ supplier_name: d.supplier_name, ...cleanProfile(d) } as any, { onConflict: 'supplier_name' })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/suppliers?name=... — remove the supplier profile. (OC history,
// if any, is preserved and still appears as a derived entry.)
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const name = new URL(req.url).searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'Falta el proveedor' }, { status: 400 });

  const { error } = await supabaseAdmin.from('supplier_profiles' as any).delete().eq('supplier_name', name);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
