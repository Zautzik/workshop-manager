'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const queryKeys = {
  workers: (dept?: string) => ['workers', { dept }] as const,
  workerStats: (dept?: string) => ['workerStats', { dept }] as const,
  workerName: (id?: string | null) => ['workerName', { id }] as const,
  machines: ['machines'] as const,
  ots: ['ots'] as const,
  batchesAvailable: ['batches', 'available'] as const,
};

const OT_SELECT = `
  *,
  workstation:workstations(*),
  machine:machines!assigned_machine_id(id,name,type)
` as const;

export function useWorkers() {
  return useQuery({
    queryKey: queryKeys.workers(),
    queryFn: async () => {
      // Use the API route so supabaseAdmin bypasses RLS (dev bypass has no JWT).
      const res = await fetch('/api/workers?limit=200', { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to fetch workers: ${res.status}`);
      const payload = await res.json();
      const rows: any[] = Array.isArray(payload) ? payload : (payload?.data ?? []);
      return rows.map((employee: any) => ({
        ...employee,
        name: employee.full_name ?? employee.name,
      }));
    },
  });
}

export function useWorkerStats(departmentFilter?: string) {
  return useQuery({
    queryKey: queryKeys.workerStats(departmentFilter),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (departmentFilter && departmentFilter !== 'all') {
        params.set('department', departmentFilter);
      }

      const response = await fetch(`/api/worker-stats?${params.toString()}`);
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.error ?? 'Failed to fetch worker stats');
      }

      return response.json();
    },
  });
}

export function useWorkerName(workerId?: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.workerName(workerId),
    queryFn: async () => {
      if (!workerId) return null;
      const { data, error } = await supabase
        .from('employees')
        .select('full_name')
        .eq('id', workerId)
        .maybeSingle();
      if (error) throw error;
      return data?.full_name ?? null;
    },
    enabled: Boolean(workerId) && enabled,
  });
}

export function useMachines() {
  return useQuery<any[]>({
    queryKey: queryKeys.machines,
    queryFn: async () => {
      const response = await fetch('/api/machines', {
        credentials: 'include',
      });

      let payload: any = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to fetch machines');
      }

      return (payload ?? []) as any[];
    },
  });
}

export function useOTs() {
  return useQuery({
    queryKey: queryKeys.ots,
    queryFn: async () => {
      // Use the API route so supabaseAdmin bypasses RLS (dev bypass has no JWT).
      const res = await fetch('/api/ots?limit=200', { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to fetch OTs: ${res.status}`);
      const payload = await res.json();
      return (Array.isArray(payload) ? payload : (payload?.data ?? [])) as any[];
    },
  });
}

export function useBatchesAvailable() {
  return useQuery<any[]>({
    queryKey: queryKeys.batchesAvailable,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batches' as any)
        .select('*')
        .gt('quantity_remaining', 0)
        .order('batch_number');
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}
