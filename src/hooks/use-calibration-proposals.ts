'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface CalibrationChange {
  path: string;
  current_value: number;
  proposed_value: number;
}

export interface CalibrationProposal {
  id: string;
  proposed_by: string | null;
  proposed_at: string;
  changes: CalibrationChange[];
  based_on: unknown;
  reason: string;
  status: 'pending' | 'applied' | 'rejected';
  applied_by: string | null;
  applied_at: string | null;
  applied_note: string | null;
}

/** Propuestas de ajuste a CALIBRATION — la compuerta §6.6, con rastro. */
export function useCalibrationProposals() {
  return useQuery<CalibrationProposal[]>({
    queryKey: ['calibracion', 'propuestas'],
    queryFn: async () => {
      const res = await fetch('/api/estimator/calibration-proposals');
      if (!res.ok) throw new Error('Failed to fetch calibration proposals');
      return (await res.json()).data ?? [];
    },
  });
}

export function useCreateCalibrationProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { changes: CalibrationChange[]; reason: string; based_on?: unknown }) => {
      const res = await fetch('/api/estimator/calibration-proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? 'No se pudo crear la propuesta');
      return json.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calibracion', 'propuestas'] }),
  });
}

export function useResolveCalibrationProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, applied_note }: { id: string; status: 'applied' | 'rejected'; applied_note?: string }) => {
      const res = await fetch(`/api/estimator/calibration-proposals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, applied_note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? 'No se pudo actualizar');
      return json.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calibracion', 'propuestas'] }),
  });
}
