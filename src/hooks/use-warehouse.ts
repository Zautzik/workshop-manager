/**
 * @fileoverview React Query hooks for WhatsApp Warehouse Tracking
 *
 * Provides data fetching, mutations, and polling for the warehouse
 * scan-based inventory management system.
 */
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  WhatsAppWarehouseLog,
  WhatsAppWarehouseSummary,
  WarehouseQRData,
  WarehouseActionType,
} from '@/types/whatsapp-warehouse';

/* ─── Query Keys ─────────────────────────────────────────────── */

export const whQueryKeys = {
  summary: ['warehouse', 'summary'] as const,
  logs: (filters?: Record<string, string>) => ['warehouse', 'logs', filters] as const,
  log: (id: string) => ['warehouse', 'logs', id] as const,
  pending: ['warehouse', 'logs', { status: 'pending' }] as const,
  qrCodes: (itemIds: string[]) => ['warehouse', 'qr', itemIds] as const,
};

/* ─── Summary Stats ──────────────────────────────────────────── */

export function useWarehouseSummary() {
  return useQuery<WhatsAppWarehouseSummary>({
    queryKey: whQueryKeys.summary,
    queryFn: async () => {
      const res = await fetch('/api/whatsapp/warehouse/summary');
      if (!res.ok) throw new Error('Failed to fetch warehouse summary');
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
}

/* ─── Logs List ──────────────────────────────────────────────── */

export function useWarehouseLogs(filters?: {
  status?: string;
  action?: string;
  item_id?: string;
  ot_number?: string;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.action) params.set('action', filters.action);
  if (filters?.item_id) params.set('item_id', filters.item_id);
  if (filters?.ot_number) params.set('ot_number', filters.ot_number);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  const filterObj = Object.fromEntries(params);

  return useQuery<WhatsAppWarehouseLog[]>({
    queryKey: whQueryKeys.logs(filterObj),
    queryFn: async () => {
      const res = await fetch(`/api/whatsapp/warehouse/logs?${params}`);
      if (!res.ok) throw new Error('Failed to fetch warehouse logs');
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/* ─── Pending Reviews ────────────────────────────────────────── */

export function useWarehousePendingReviews() {
  return useWarehouseLogs({ status: 'pending', limit: 50 });
}

/* ─── Single Log ─────────────────────────────────────────────── */

export function useWarehouseLog(id: string | null) {
  return useQuery<WhatsAppWarehouseLog>({
    queryKey: whQueryKeys.log(id ?? ''),
    queryFn: async () => {
      const res = await fetch(`/api/whatsapp/warehouse/logs/${id}`);
      if (!res.ok) throw new Error('Failed to fetch warehouse log');
      return res.json();
    },
    enabled: !!id,
  });
}

/* ─── Review Mutation ────────────────────────────────────────── */

export function useReviewWarehouseLog() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      review_status,
      review_comments,
      corrected_quantity,
      corrected_unit_cost,
      lot_id,
    }: {
      id: string;
      review_status: 'approved' | 'rejected' | 'needs_revision';
      review_comments?: string;
      corrected_quantity?: number;
      corrected_unit_cost?: number;
      lot_id?: string;
    }) => {
      const res = await fetch(`/api/whatsapp/warehouse/logs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_status,
          review_comments,
          corrected_quantity,
          corrected_unit_cost,
          lot_id,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Review failed');
      }
      const data = await res.json();
      return data as { status: string; review_status: string; _warning?: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouse'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

/* ─── Batch Review ───────────────────────────────────────────── */

export function useBatchReviewWarehouse() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ids,
      review_status,
      review_comments,
    }: {
      ids: string[];
      review_status: 'approved' | 'rejected';
      review_comments?: string;
    }) => {
      const res = await fetch('/api/whatsapp/warehouse/logs/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, review_status, review_comments }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Batch review failed');
      }
      return res.json() as Promise<{
        total: number;
        successes: number;
        failures: number;
        results: Array<{ id: string; ok: boolean; error?: string }>;
      }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouse'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

/* ─── Manual Entry ───────────────────────────────────────────── */

export function useManualWarehouseEntry() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      action_type: WarehouseActionType;
      item_id: string;
      quantity?: number;
      unit?: string;
      unit_cost?: number;
      ot_number?: string;
      lot_id?: string;
      supplier_name?: string;
      notes?: string;
      operator_name: string;
    }) => {
      const res = await fetch('/api/whatsapp/warehouse/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Manual entry failed');
      }
      return res.json() as Promise<{ id: string; status: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouse'] });
    },
  });
}

/* ─── QR Code Generation ────────────────────────────────────── */

export function useGenerateWarehouseQR() {
  return useMutation({
    mutationFn: async ({
      item_ids,
      action,
      ot_number,
    }: {
      item_ids: string[];
      action?: WarehouseActionType;
      ot_number?: string;
    }) => {
      const res = await fetch('/api/whatsapp/warehouse/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_ids, action, ot_number }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'QR generation failed');
      }
      return res.json() as Promise<{ count: number; qr_codes: WarehouseQRData[] }>;
    },
  });
}
