'use client';
import { useQuery } from '@tanstack/react-query';

export interface MachineActivityRow {
  machine_id: string;
  name: string | null;
  type: string | null;
  status: string | null;
  production_hours: number;
  ots_processed: number;
  current_active: number;
}

export interface MachineActivityResponse {
  window_days: number;
  machines: MachineActivityRow[];
  summary: {
    machine_count: number;
    total_production_hours: number;
    producing_now: number;
    active_ots: number;
    busiest: { name: string | null; hours: number } | null;
  };
}

/** Real machine load from ot_status_history (production hours / OTs / active). */
export function useMachineActivity() {
  return useQuery<MachineActivityResponse>({
    queryKey: ['machine-activity'],
    queryFn: async () => {
      const res = await fetch('/api/machines/activity', { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to fetch machine activity: ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });
}
