'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const queryKeys = {
  workers: (dept?: string) => ['workers', { dept }] as const,
  workerStats: (dept?: string) => ['workerStats', { dept }] as const,
  workerName: (id?: string | null) => ['workerName', { id }] as const,
  machines: ['machines'] as const,
  // `ots` vivía acá también -- ver el comentario sobre useOTs() más abajo.
  batchesAvailable: ['batches', 'available'] as const,
};

const OT_SELECT = `
  *,
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

/**
 * Este archivo tenía su PROPIO `useOTs()`, con su propio `queryKeys.ots`
 * local que por casualidad vale lo mismo (`['ots']`) que el de
 * use-workflow-queries.ts -- React Query compara keys por valor, no por
 * identidad del array, así que las dos definiciones compartían el mismo
 * cache sin que ninguna lo supiera. Funcionaba mientras las dos devolvían
 * un array plano; dejó de funcionar en el momento en que una de las dos
 * (use-workflow-queries.ts, para exponer `isTruncated`) cambió de forma —
 * cualquier componente que montara primero decidía qué forma quedaba en el
 * cache, y el otro grupo de consumidores leía `undefined` donde esperaba un
 * arreglo (Kanban en blanco, 2026-09-05).
 *
 * La corrección no es sincronizar dos copias a mano: es que exista una sola.
 * Se re-exporta la de use-workflow-queries.ts -- misma `{ data, ... }` que
 * ya esperan los ~14 consumidores de ESTE archivo (todos desestructuran
 * `{ data: x = [] }`), más `total`/`isTruncated` de regalo.
 */
export { useOTs } from '@/hooks/use-workflow-queries';

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
