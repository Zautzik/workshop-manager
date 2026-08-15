'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** An OC row as returned by the oc_billing view. */
export interface OCRow {
  id: string;
  oc_number: string | null;
  ot_id: string | null;
  ot_number: string | null;
  supplier: string;
  supplier_rut: string | null;
  status: 'draft' | 'sent' | 'received' | 'invoiced' | 'closed' | 'cancelled';
  purchase_date: string;
  expected_date: string | null;
  total_cost: number;
  notes: string | null;
  /* ── El calce a tres bandas (`oc_conciliacion`) ─────────────────────────
   *
   * `variance` comparaba lo pedido contra lo facturado y se saltaba lo que
   * efectivamente llegó, que es donde se pierde plata: recibir 480 y que te
   * facturen 500 daba variación cero. Estas tres cifras y sus dos brechas
   * son la versión completa. */
  pedido: number;
  recibido: number;
  facturado: number;
  brecha_recepcion: number;
  brecha_facturacion: number;
  lotes: number;
  /** Lotes recibidos con el certificado ya vencido. FSSC lo mira primero. */
  certificados_vencidos: number;
  issued_at: string | null;

  /* Contrato anterior, sostenido mientras las pantallas migran. */
  invoiced_total: number;
  invoice_count: number;
  matched_count: number;
  variance: number;
}

export interface FacturaCompra {
  id: string;
  purchase_id: string;
  invoice_number: string;
  invoice_date: string;
  amount: number;
  status: 'received' | 'matched' | 'disputed' | 'paid';
  matched_at: string | null;
  notes: string | null;
}

async function postJSON(url: string, body: unknown, method = 'POST') {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? 'Request failed');
  return json.data ?? json;
}

/** Facturas de compra registered against an OC. */
export function usePurchaseInvoices(purchaseId: string | null) {
  return useQuery<FacturaCompra[]>({
    queryKey: ['purchases', 'invoices', purchaseId],
    enabled: !!purchaseId,
    queryFn: async () => {
      const res = await fetch(`/api/purchases/${purchaseId}/invoices`);
      if (!res.ok) throw new Error('Failed to fetch facturas');
      const json = await res.json();
      return (json.data ?? []) as FacturaCompra[];
    },
  });
}

function useInvalidateProcurement() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['purchases'] });
    qc.invalidateQueries({ queryKey: ['ot-cost-summary'] });
  };
}

export function useCreateOC() {
  const invalidate = useInvalidateProcurement();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => postJSON('/api/purchases', payload),
    onSuccess: invalidate,
  });
}

export function useUpdateOC() {
  const invalidate = useInvalidateProcurement();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      postJSON(`/api/purchases/${id}`, payload, 'PATCH'),
    onSuccess: invalidate,
  });
}

export function useCreateFactura() {
  const invalidate = useInvalidateProcurement();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ purchaseId, ...payload }: { purchaseId: string } & Record<string, unknown>) =>
      postJSON(`/api/purchases/${purchaseId}/invoices`, payload),
    onSuccess: (_d, vars) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['purchases', 'invoices', vars.purchaseId] });
    },
  });
}

export function useUpdateFactura() {
  const invalidate = useInvalidateProcurement();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ purchaseId, invoiceId, ...payload }: { purchaseId: string; invoiceId: string } & Record<string, unknown>) =>
      postJSON(`/api/purchases/${purchaseId}/invoices/${invoiceId}`, payload, 'PATCH'),
    onSuccess: (_d, vars) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['purchases', 'invoices', vars.purchaseId] });
    },
  });
}

export interface StockItem {
  id: string;
  name: string;
  sku: string;
  unit: string;
}

/** Inventory items for the goods-receipt picker (server route, dev-safe). */
export function useStockItems(search = '') {
  return useQuery<StockItem[]>({
    queryKey: ['inventory', 'stock-items', search],
    queryFn: async () => {
      const res = await fetch(`/api/inventory/stock${search ? `?q=${encodeURIComponent(search)}` : ''}`);
      if (!res.ok) throw new Error('Failed to fetch items');
      return (await res.json()) as StockItem[];
    },
  });
}

/** Receive a material from an OC into a lot (purchase_id linked); advances the OC. */
export function useReceiveOC() {
  const invalidate = useInvalidateProcurement();
  return useMutation({
    mutationFn: ({ purchaseId, ...payload }: { purchaseId: string } & Record<string, unknown>) =>
      postJSON(`/api/purchases/${purchaseId}/receive`, payload),
    onSuccess: invalidate,
  });
}

export interface SupplierCertification {
  name: string;
  code?: string | null;
  expires_on?: string | null;
}

export interface Supplier {
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

export interface SupplierCategory {
  id: string;
  name: string;
  kind: 'material' | 'service' | null;
}

/** Supplier directory derived from purchases (OCs) + profile overlay. */
export function useSuppliers() {
  return useQuery<{ data: Supplier[]; totals: { count: number; spend: number; open: number; pefc: number } }>({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const res = await fetch('/api/suppliers');
      if (!res.ok) throw new Error('Failed to fetch suppliers');
      return res.json();
    },
  });
}

/** Flexible supplier-category catalog. */
export function useSupplierCategories() {
  return useQuery<SupplierCategory[]>({
    queryKey: ['supplier-categories'],
    queryFn: async () => {
      const res = await fetch('/api/supplier-categories');
      if (!res.ok) throw new Error('Failed to fetch categories');
      return (await res.json()).data ?? [];
    },
  });
}

export function useCreateSupplierCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; kind?: string | null }) => postJSON('/api/supplier-categories', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier-categories'] }),
  });
}

export function useSaveSupplierProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => postJSON('/api/suppliers', payload, 'PATCH'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => postJSON('/api/suppliers', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => postJSON(`/api/suppliers?name=${encodeURIComponent(name)}`, undefined, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}
