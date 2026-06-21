'use client';
import { useQuery } from '@tanstack/react-query';

export interface RetentionStatus {
  policy_years: number;
  total_ots: number;
  under_retention: number;
  past_retention: number;
  oldest_record: string | null;
  next_retention_expiry: string | null;
  retained_through: string | null;
  attachments_count: number;
  status_events_count: number;
}

/** FSSC 22000 records-retention status. */
export function useRetention() {
  return useQuery<RetentionStatus>({
    queryKey: ['retention'],
    queryFn: async () => {
      const res = await fetch('/api/retention', { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to fetch retention: ${res.status}`);
      return res.json();
    },
    staleTime: 300_000,
  });
}
