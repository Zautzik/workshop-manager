'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface CostAlert {
  ot_id: string;
  ot_number: string;
  client_name: string | null;
  revenue: number;
  estimated_cost: number;
  actual_cost: number;
  overrun_pct: number;
  overrun_amount: number;
}

export function useCostAlerts() {
  return useQuery<{ threshold: number; count: number; alerts: CostAlert[] }>({
    queryKey: ['cost-alerts'],
    queryFn: async () => {
      const res = await fetch('/api/cost-alerts');
      if (!res.ok) throw new Error('Failed to fetch cost alerts');
      return res.json();
    },
  });
}

export function useSetCostThreshold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (threshold: number) => {
      const res = await fetch('/api/cost-alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? 'Request failed');
      return json;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cost-alerts'] }),
  });
}
