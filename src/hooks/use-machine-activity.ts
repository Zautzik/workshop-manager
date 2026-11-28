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
    /** Hours from passes whose machine could not be determined. */
    unattributed_hours: number;
    /** Those hours by route stage — the machine type is known, the unit is not. */
    unattributed_by_stage: Array<{ stage: string; hours: number }>;
    producing_now: number;
    active_ots: number;
    busiest: { name: string | null; hours: number } | null;
  };
}

/** Real machine load: closed-pass hours from the ledger (ot_stage_reports), OTs, active now. */
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
