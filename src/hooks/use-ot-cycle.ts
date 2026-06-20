import { useQuery } from '@tanstack/react-query';

// ─── Shapes returned by the cycle endpoints ─────────────────────────────────

export interface OTHistoryEvent {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_by_role: string | null;
  reason: string | null;
  rollback: boolean;
  created_at: string;
  stage_left: string | null;
  dwell_hours: number;
}

export interface OTHistoryResponse {
  ot: {
    id: string;
    ot_number: string | null;
    client_name: string | null;
    status: string | null;
    created_at: string | null;
    description: string | null;
    quantity: number | null;
    deadline: string | null;
  };
  events: OTHistoryEvent[];
  current_dwell_hours: number | null;
}

export interface StageStat {
  stage: string;
  avg_hours: number;
  samples: number;
}

export interface ActivityEvent {
  id: string;
  ot_id: string;
  ot_number: string | null;
  client_name: string | null;
  from_status: string | null;
  to_status: string;
  changed_by_role: string | null;
  rollback: boolean;
  created_at: string;
}

export interface CycleAnalytics {
  stage_stats: StageStat[];
  bottleneck: StageStat | null;
  avg_lead_time_hours: number | null;
  completed_count: number;
  wip: number;
  current_distribution: Record<string, number>;
  recent_activity: ActivityEvent[];
  total_events: number;
}

/** Shop-wide flow intelligence: bottleneck, lead time, WIP, activity feed. */
export function useCycleAnalytics() {
  return useQuery<CycleAnalytics>({
    queryKey: ['ot-cycle-analytics'],
    queryFn: async () => {
      const res = await fetch('/api/ots/cycle-analytics', { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to fetch cycle analytics: ${res.status}`);
      return res.json();
    },
  });
}

/** Full audited lifecycle of one OT (by id). Disabled until an id is provided. */
export function useOTHistory(otId: string | null) {
  return useQuery<OTHistoryResponse>({
    queryKey: ['ot-history', otId],
    enabled: !!otId,
    queryFn: async () => {
      const res = await fetch(`/api/ots/${otId}/history`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to fetch OT history: ${res.status}`);
      return res.json();
    },
  });
}
