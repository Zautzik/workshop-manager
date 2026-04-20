/**
 * @fileoverview React Query hooks for WhatsApp Production Tracking
 *
 * Provides data fetching, mutations, and real-time updates for
 * the WhatsApp production tracking system.
 */
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { WhatsAppProductionLog, WhatsAppProductionSummary } from '@/types/whatsapp-production';

/* ─── Query Keys ─────────────────────────────────────────────── */

export const waQueryKeys = {
  summary: ['whatsapp', 'summary'] as const,
  logs: (filters?: Record<string, string>) => ['whatsapp', 'logs', filters] as const,
  log: (id: string) => ['whatsapp', 'logs', id] as const,
  pending: ['whatsapp', 'logs', { status: 'pending' }] as const,
};

/* ─── Summary Stats ──────────────────────────────────────────── */

export function useWhatsAppSummary() {
  return useQuery<WhatsAppProductionSummary>({
    queryKey: waQueryKeys.summary,
    queryFn: async () => {
      const res = await fetch('/api/whatsapp/summary');
      if (!res.ok) throw new Error('Failed to fetch summary');
      return res.json();
    },
    refetchInterval: 30_000, // Every 30s — enough for dashboard feel
    staleTime: 20_000,
  });
}

/* ─── Logs List ──────────────────────────────────────────────── */

export function useWhatsAppLogs(filters?: {
  status?: string;
  ot_number?: string;
  type?: string;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.ot_number) params.set('ot_number', filters.ot_number);
  if (filters?.type) params.set('type', filters.type);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  const filterObj = Object.fromEntries(params);

  return useQuery<{ data: WhatsAppProductionLog[]; total: number }>({
    queryKey: waQueryKeys.logs(filterObj),
    queryFn: async () => {
      const res = await fetch(`/api/whatsapp/logs?${params}`);
      if (!res.ok) throw new Error('Failed to fetch logs');
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/* ─── Pending Reviews ────────────────────────────────────────── */

export function useWhatsAppPendingReviews() {
  return useWhatsAppLogs({ status: 'pending', type: 'end', limit: 50 });
}

/* ─── Single Log ─────────────────────────────────────────────── */

export function useWhatsAppLog(id: string | null) {
  return useQuery<WhatsAppProductionLog>({
    queryKey: waQueryKeys.log(id ?? ''),
    queryFn: async () => {
      const res = await fetch(`/api/whatsapp/logs/${id}`);
      if (!res.ok) throw new Error('Failed to fetch log');
      return res.json();
    },
    enabled: !!id,
  });
}

/* ─── Review Mutation (Approve / Reject) ─────────────────────── */

export function useReviewWhatsAppLog() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      action,
      comments,
      corrected_data,
      corrected_costs,
    }: {
      id: string;
      action: 'approve' | 'reject' | 'needs_revision';
      comments?: string;
      corrected_data?: Record<string, unknown>;
      corrected_costs?: Record<string, unknown>;
    }) => {
      const res = await fetch(`/api/whatsapp/logs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, comments, corrected_data, corrected_costs }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Review failed');
      }
      const data = await res.json();
      return data as WhatsAppProductionLog & { _warning?: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp'] });
    },
  });
}

/* ─── Batch Review Mutation ──────────────────────────────────── */

export function useBatchReviewWhatsApp() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ids,
      action,
      comments,
    }: {
      ids: string[];
      action: 'approve' | 'reject';
      comments?: string;
    }) => {
      const res = await fetch('/api/whatsapp/logs/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action, comments }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Batch review failed');
      }
      return res.json() as Promise<{
        updated: number;
        action: string;
        feed_results?: { id: string; success: boolean; error?: string }[];
      }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp'] });
    },
  });
}

/* ─── Manual Entry Mutation ──────────────────────────────────── */

export function useManualWhatsAppEntry() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      message,
      operator_name,
    }: {
      message: string;
      operator_name?: string;
    }) => {
      const res = await fetch('/api/whatsapp/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, operator_name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Entry failed');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp'] });
    },
  });
}
