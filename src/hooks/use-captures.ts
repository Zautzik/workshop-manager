'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface CaptureEvent {
  id: string;
  domain: 'production' | 'warehouse' | 'dispatch' | 'receipt' | 'other';
  event_type: string;
  channel: 'whatsapp' | 'qr' | 'manual' | 'photo' | 'system';
  operator_name: string | null;
  operator_phone: string | null;
  ot_id: string | null;
  ot_number: string | null;
  item_id: string | null;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  raw_message: string | null;
  message_timestamp: string;
  status: 'pending' | 'approved' | 'auto_approved' | 'rejected' | 'needs_revision';
  applied: boolean;
  applied_ref_type: string | null;
  inferred_costs: unknown;
  corrected_costs: unknown;
  reviewed_at: string | null;
  created_at: string;
}

export interface CaptureCounts {
  total: number;
  pending: number;
  applied: number;
  production: number;
  warehouse: number;
}

export function useCaptures(filters?: { domain?: string; status?: string; applied?: string }) {
  const params = new URLSearchParams();
  if (filters?.domain) params.set('domain', filters.domain);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.applied) params.set('applied', filters.applied);

  return useQuery<{ data: CaptureEvent[]; counts: CaptureCounts }>({
    queryKey: ['captures', filters ?? {}],
    queryFn: async () => {
      const res = await fetch(`/api/captures?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch captures');
      return res.json();
    },
  });
}

export function useReviewCapture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string } & Record<string, unknown>) => {
      const res = await fetch(`/api/captures/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? 'Request failed');
      return json; // may carry _warning when applied best-effort failed
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['captures'] });
      qc.invalidateQueries({ queryKey: ['ot-cost-summary'] });
    },
  });
}
