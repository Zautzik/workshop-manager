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
