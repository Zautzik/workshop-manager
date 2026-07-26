'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const isDevBypass =
  process.env.NODE_ENV === 'development' &&
  process.env.NEXT_PUBLIC_DEV_BYPASS === 'true';

const devMachine = { id: 'dev-machine-1', name: 'Ryobi 524GS', type: 'offset_printer' };

const devChecklists: any[] = [
  {
    id: 'dev-checklist-1',
    name: 'PM semanal Ryobi 524GS',
    frequency: 'weekly',
    machine_type: 'offset_printer',
    items: ['Lubricar puntos criticos', 'Revisar rodillos', 'Limpiar sensores'],
    machines: { name: devMachine.name },
    created_at: '2026-06-01T08:00:00.000Z',
  },
  {
    id: 'dev-checklist-2',
    name: 'PM mensual Guillotina',
    frequency: 'monthly',
    machine_type: 'guillotine',
    items: ['Calibrar tope', 'Revisar cuchilla', 'Verificar seguridad'],
    machines: { name: 'Guillotina Industrial' },
    created_at: '2026-06-02T08:00:00.000Z',
  },
];

const devWorkOrders: any[] = [
  {
    id: 'dev-wo-1',
    machine_id: devMachine.id,
    checklist_id: 'dev-checklist-1',
    scheduled_date: new Date().toISOString(),
    status: 'pending',
    machines: { name: devMachine.name, type: devMachine.type },
    maintenance_checklists: devChecklists[0],
  },
  {
    id: 'dev-wo-2',
    machine_id: 'dev-machine-2',
    checklist_id: 'dev-checklist-2',
    scheduled_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: 'in_progress',
    machines: { name: 'Guillotina Industrial', type: 'guillotine' },
    maintenance_checklists: devChecklists[1],
  },
  {
    id: 'dev-wo-3',
    machine_id: devMachine.id,
    checklist_id: 'dev-checklist-1',
    scheduled_date: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    status: 'completed',
    machines: { name: devMachine.name, type: devMachine.type },
    maintenance_checklists: devChecklists[0],
  },
];

const devPrograms: any[] = [
  {
    id: 'dev-program-1',
    name: 'Programa semanal de imprenta',
    machine_model: 'Ryobi 524GS',
    is_active: true,
    created_at: '2026-06-01T08:00:00.000Z',
  },
];

const devProgramTasks: any[] = [
  {
    id: 'dev-task-1',
    program_id: 'dev-program-1',
    description: 'Inspeccion visual general',
    frequency: 'daily',
    action_type: 'inspection',
    sort_order: 1,
    is_active: true,
  },
  {
    id: 'dev-task-2',
    program_id: 'dev-program-1',
    description: 'Lubricacion de rodillos',
    frequency: 'weekly',
    action_type: 'lubrication',
    sort_order: 2,
    is_active: true,
  },
];

const queryKeys = {
  checklists: ['maintenance', 'checklists'] as const,
  workOrders: ['maintenance', 'workOrders'] as const,
  workOrdersByStatus: (statuses?: string[]) => ['maintenance', 'workOrders', { statuses }] as const,
  maintenanceTaskCompletions: (orderId?: string | null) => ['maintenance', 'taskCompletions', { orderId }] as const,
};

export function useMaintenanceChecklists() {
  return useQuery({
    queryKey: queryKeys.checklists,
    queryFn: async () => {
      if (isDevBypass) {
        return devChecklists;
      }

      const { data, error } = await supabase
        .from('maintenance_checklists')
        .select('*, machines(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMaintenanceWorkOrders() {
  return useQuery({
    queryKey: queryKeys.workOrders,
    queryFn: async () => {
      if (isDevBypass) {
        return devWorkOrders;
      }

      const { data, error } = await supabase
        .from('maintenance_work_orders')
        .select('*, machines(name), maintenance_checklists(name, frequency, machine_type)')
        .order('scheduled_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMaintenanceWorkOrdersByStatus(statuses: string[]) {
  return useQuery<any[]>({
    queryKey: queryKeys.workOrdersByStatus(statuses),
    queryFn: async () => {
      if (isDevBypass) {
        return devWorkOrders.filter((wo) => statuses.includes(String(wo.status)));
      }

      const { data, error } = await supabase
        .from('maintenance_work_orders')
        .select('*, machines(name, type), maintenance_checklists(name, frequency, machine_type, items)')
        .in('status', statuses)
        .order('scheduled_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useMaintenanceTaskCompletions(orderId?: string | null) {
  return useQuery({
    queryKey: queryKeys.maintenanceTaskCompletions(orderId),
    queryFn: async () => {
      if (!orderId) return [];
      if (isDevBypass) return [];
      const { data, error } = await supabase
        .from('maintenance_task_completions')
        .select('*, maintenance_tasks(*)')
        .eq('work_order_id', orderId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(orderId),
  });
}

export function useMaintenanceStats() {
  return useQuery({
    queryKey: [...queryKeys.workOrders, 'stats'],
    queryFn: async () => {
      if (isDevBypass) {
        const rows = devWorkOrders;
        return {
          pending: rows.filter((row) => row.status === 'pending').length,
          in_progress: rows.filter((row) => row.status === 'in_progress').length,
          completed: rows.filter((row) => row.status === 'completed').length,
          total: rows.length,
        };
      }

      const { data, error } = await supabase.from('maintenance_work_orders').select('status');
      if (error) throw error;
      const rows = data ?? [];
      return {
        pending: rows.filter((row) => row.status === 'pending').length,
        in_progress: rows.filter((row) => row.status === 'in_progress').length,
        completed: rows.filter((row) => row.status === 'completed').length,
        total: rows.length,
      };
    },
    staleTime: 30_000,
  });
}

export function useMaintenancePrograms() {
  return useQuery<any[]>({
    queryKey: ['maintenance-programs'],
    queryFn: async () => {
      if (isDevBypass) {
        return devPrograms;
      }

      const { data, error } = await supabase
        .from('maintenance_programs')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProgramTasks(programId?: string | null) {
  return useQuery<any[]>({
    queryKey: ['program-tasks', programId],
    queryFn: async () => {
      if (!programId) return [];
      if (isDevBypass) {
        return devProgramTasks.filter((task) => task.program_id === programId);
      }
      const { data, error } = await supabase
        .from('program_tasks')
        .select('*')
        .eq('program_id', programId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(programId),
  });
}

export function useWeeklyProgramLogs(programId?: string | null, weekStart?: string | null) {
  return useQuery<any[]>({
    queryKey: ['program-task-logs', programId, weekStart],
    queryFn: async () => {
      if (!programId || !weekStart) return [];
      if (isDevBypass) return [];
      const { data, error } = await supabase
        .from('program_task_logs')
        .select('*')
        .eq('program_id', programId)
        .eq('week_start', weekStart);
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(programId && weekStart),
  });
}

export function useToggleProgramTaskLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskId,
      programId,
      weekStart,
      dayOfWeek,
      completed,
      completedBy,
    }: {
      taskId: string;
      programId: string;
      weekStart: string;
      dayOfWeek: number;
      completed: boolean;
      completedBy?: string | null;
    }) => {
      // Through the API: works under dev bypass (requireAuth is satisfied
      // server-side), and the server stamps who completed the task.
      const res = completed
        ? await fetch('/api/maintenance/programs/task-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              task_id: taskId,
              program_id: programId,
              week_start: weekStart,
              day_of_week: dayOfWeek,
            }),
          })
        : await fetch(
            `/api/maintenance/programs/task-logs?task_id=${encodeURIComponent(taskId)}&week_start=${encodeURIComponent(weekStart)}&day_of_week=${dayOfWeek}`,
            { method: 'DELETE', credentials: 'include' }
          );

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'No se pudo registrar la tarea');
      }
    },
    onSuccess: (_result, { programId, weekStart }) => {
      queryClient.invalidateQueries({
        queryKey: ['program-task-logs', programId, weekStart],
      });
    },
  });
}

export function useUpdateProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string;
      name?: string;
      machine_model?: string;
      source_language?: string;
      description?: string;
    }) => {
      const res = await fetch(`/api/maintenance/programs?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'No se pudo actualizar el programa');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-programs'] });
    },
  });
}

export function useCreateProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (program: {
      name: string;
      machine_model: string;
      source_language?: string;
      description?: string;
      manual_source?: string;
    }) => {
      if (isDevBypass) {
        return {
          id: `dev-program-${Date.now()}`,
          ...program,
          is_active: true,
        } as { id: string; [key: string]: any };
      }

      const res = await fetch('/api/maintenance/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(program),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo crear el programa');
      }
      return data as { id: string; [key: string]: any };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-programs'] });
    },
  });
}

export function useDeleteProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/maintenance/programs?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_active: false }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'No se pudo eliminar el programa');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-programs'] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      programId,
      ...patch
    }: {
      id: string;
      programId: string;
      description?: string;
      section?: string | null;
      subsection?: string | null;
      frequency?: string;
      action_type?: string;
      estimated_minutes?: number | null;
      task_number?: number | null;
    }) => {
      if (isDevBypass) return;

      const res = await fetch(`/api/maintenance/programs/tasks?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'No se pudo actualizar la tarea');
      }
    },
    onSuccess: (_result, { programId }) => {
      queryClient.invalidateQueries({ queryKey: ['program-tasks', programId] });
    },
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (task: {
      program_id: string;
      description: string;
      section?: string | null;
      subsection?: string | null;
      frequency: string;
      action_type: string;
      estimated_minutes?: number | null;
      task_number?: number | null;
      sort_order?: number;
      source?: string;
    }) => {
      if (isDevBypass) {
        return {
          id: `dev-task-${Date.now()}`,
          ...task,
          is_active: true,
        };
      }

      const res = await fetch('/api/maintenance/programs/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(task),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo crear la tarea');
      }
      return data;
    },
    onSuccess: (_result, { program_id }) => {
      queryClient.invalidateQueries({ queryKey: ['program-tasks', program_id] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, programId }: { id: string; programId: string }) => {
      if (isDevBypass) return;

      const res = await fetch(`/api/maintenance/programs/tasks?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_active: false }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'No se pudo eliminar la tarea');
      }
    },
    onSuccess: (_result, { programId }) => {
      queryClient.invalidateQueries({ queryKey: ['program-tasks', programId] });
    },
  });
}
