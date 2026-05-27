'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
      if (completed) {
        const { error } = await supabase
          .from('program_task_logs')
          .upsert(
            {
              task_id: taskId,
              program_id: programId,
              week_start: weekStart,
              day_of_week: dayOfWeek,
              completed: true,
              completed_by: completedBy ?? null,
              completed_at: new Date().toISOString(),
            },
            { onConflict: 'task_id,week_start,day_of_week' }
          );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('program_task_logs')
          .delete()
          .eq('task_id', taskId)
          .eq('week_start', weekStart)
          .eq('day_of_week', dayOfWeek);
        if (error) throw error;
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
      const { error } = await supabase
        .from('maintenance_programs')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
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
      const { data, error } = await supabase
        .from('maintenance_programs')
        .insert({ ...program, is_active: true })
        .select()
        .single();
      if (error) throw error;
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
      const { error } = await supabase
        .from('maintenance_programs')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
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
      const { error } = await supabase.from('program_tasks').update(patch as any).eq('id', id);
      if (error) throw error;
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
      const { data, error } = await supabase
        .from('program_tasks')
        .insert({ ...task, is_active: true } as any)
        .select()
        .single();
      if (error) throw error;
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
      const { error } = await supabase.from('program_tasks').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_result, { programId }) => {
      queryClient.invalidateQueries({ queryKey: ['program-tasks', programId] });
    },
  });
}
