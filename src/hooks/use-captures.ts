'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateAfterReview } from './review-cache';
import type { CaptureSource, Corrections, ReviewOutcome } from '@/lib/golden-thread';

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
  truncated: boolean;
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

/* ─── Revisión — eslabón 2 del hilo dorado (src/lib/golden-thread.ts) ───────
 *
 * Un solo par de hooks para todas las pantallas que revisan partes: la bandeja
 * de Capturas, WhatsApp y bodega. `source` dice de qué tabla es el id que la
 * pantalla tiene a mano; el servidor encuentra el resto.
 */

export interface ReviewRequest {
  source: CaptureSource;
  decision: 'approve' | 'reject';
  comments?: string | null;
}

async function postReview(body: Record<string, unknown>): Promise<ReviewOutcome[]> {
  const res = await fetch('/api/captures/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? 'No se pudo revisar el parte');
  return (json.results ?? []) as ReviewOutcome[];
}

/** Revisar un parte. Devuelve su resultado; `warning` trae lo que no se pudo aplicar. */
export function useReviewCapture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, corrections, ...req }: ReviewRequest & { id: string; corrections?: Corrections }) =>
      (await postReview({ ...req, ids: [id], ...(corrections ? { corrections } : {}) }))[0],
    onSuccess: () => invalidateAfterReview(qc),
  });
}

/** Revisar varios partes con la misma decisión. Un resultado por parte. */
export function useReviewCaptures() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, ...req }: ReviewRequest & { ids: string[] }) => postReview({ ...req, ids }),
    onSuccess: () => invalidateAfterReview(qc),
  });
}
