'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface OTFulfillment {
  ot_id: string;
  ot_number: string;
  client_name: string | null;
  status: string;
  ordered_qty: number;
  quoted_price: number;
  dispatched_qty: number;
  guide_count: number;
  invoiced_total: number;
  paid_total: number;
  dispatched_pct: number;
}

export interface DispatchGuide {
  id: string;
  guide_number: string;
  ot_id: string | null;
  client_id: string | null;
  client_name: string | null;
  quantity: number;
  dispatch_date: string;
  carrier: string | null;
  vehicle_plate: string | null;
  received_by: string | null;
  status: 'draft' | 'dispatched' | 'delivered' | 'cancelled';
  invoice_id: string | null;
  notes: string | null;
}

export interface SalesInvoice {
  id: string;
  invoice_number: string;
  ot_id: string | null;
  client_id: string | null;
  client_name: string | null;
  net_amount: number;
  tax_amount: number;
  total_amount: number;
  status: 'issued' | 'sent' | 'paid' | 'cancelled';
  issued_date: string;
  due_date: string | null;
  paid_date: string | null;
  notes: string | null;
}

async function sendJSON(url: string, body: unknown, method = 'POST') {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? 'Request failed');
  return json.data ?? json;
}

export function useFulfillment(phase?: 'dispatch') {
  return useQuery<OTFulfillment[]>({
    queryKey: ['fulfillment', phase ?? 'all'],
    queryFn: async () => {
      const res = await fetch(`/api/ots/fulfillment${phase ? `?phase=${phase}` : ''}`);
      if (!res.ok) throw new Error('Failed to fetch fulfillment');
      return (await res.json()).data ?? [];
    },
  });
}

export function useDispatchGuides(otId: string | null) {
  return useQuery<DispatchGuide[]>({
    queryKey: ['dispatch-guides', otId],
    enabled: !!otId,
    queryFn: async () => {
      const res = await fetch(`/api/dispatch-guides?ot_id=${otId}`);
      if (!res.ok) throw new Error('Failed to fetch guías');
      return (await res.json()).data ?? [];
    },
  });
}

export function useSalesInvoices(otId: string | null) {
  return useQuery<SalesInvoice[]>({
    queryKey: ['sales-invoices', otId],
    enabled: !!otId,
    queryFn: async () => {
      const res = await fetch(`/api/sales-invoices?ot_id=${otId}`);
      if (!res.ok) throw new Error('Failed to fetch facturas');
      return (await res.json()).data ?? [];
    },
  });
}

function useInvalidateDispatch(otId: string | null) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['fulfillment'] });
    qc.invalidateQueries({ queryKey: ['dispatch-guides', otId] });
    qc.invalidateQueries({ queryKey: ['sales-invoices', otId] });
  };
}

export function useCreateGuide(otId: string | null) {
  const invalidate = useInvalidateDispatch(otId);
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => sendJSON('/api/dispatch-guides', payload),
    onSuccess: invalidate,
  });
}

export function useUpdateGuide(otId: string | null) {
  const invalidate = useInvalidateDispatch(otId);
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      sendJSON(`/api/dispatch-guides/${id}`, payload, 'PATCH'),
    onSuccess: invalidate,
  });
}

export function useCreateInvoice(otId: string | null) {
  const invalidate = useInvalidateDispatch(otId);
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => sendJSON('/api/sales-invoices', payload),
    onSuccess: invalidate,
  });
}

export function useUpdateInvoice(otId: string | null) {
  const invalidate = useInvalidateDispatch(otId);
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      sendJSON(`/api/sales-invoices/${id}`, payload, 'PATCH'),
    onSuccess: invalidate,
  });
}
