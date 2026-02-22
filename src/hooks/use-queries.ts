/**
 * @fileoverview React Query hooks for data fetching
 *
 * Centralised hooks that replace manual useEffect + useState patterns
 * throughout the application. Built on @tanstack/react-query which is
 * already wired up in providers.tsx.
 *
 * Benefits over manual fetching:
 *  - Automatic caching & deduplication
 *  - Background refetching (stale-while-revalidate)
 *  - Optimistic updates via mutations
 *  - Loading / error states built-in
 *
 * Usage:
 *   const { data, isLoading } = useAdminStats();
 *   const { mutate } = useCreateUser();
 */
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/* ------------------------------------------------------------------ */
/*  Query key factory — keeps cache keys consistent                   */
/* ------------------------------------------------------------------ */

export const queryKeys = {
  adminStats: ['admin', 'stats'] as const,
  users: ['users'] as const,
  workers: (dept?: string) => ['workers', { dept }] as const,
  workersByRating: ['workers', 'rating'] as const,
  workerStats: (dept?: string) => ['workerStats', { dept }] as const,
  workerName: (id?: string | null) => ['workerName', { id }] as const,
  machines: ['machines'] as const,
  jobs: ['jobs'] as const,
  ots: ['ots'] as const,
  shifts: ['shifts'] as const,
  workstations: ['workstations'] as const,
  assignments: (date?: string) => ['assignments', { date }] as const,
  batchesAvailable: ['batches', 'available'] as const,
  checklists: ['maintenance', 'checklists'] as const,
  workOrders: ['maintenance', 'workOrders'] as const,
  workOrdersByStatus: (statuses?: string[]) => ['maintenance', 'workOrders', { statuses }] as const,
  maintenanceTaskCompletions: (orderId?: string | null) => ['maintenance', 'taskCompletions', { orderId }] as const,
  inventory: ['inventory'] as const,
  purchases: ['purchases'] as const,
  machineCosts: ['machineCosts'] as const,
  equipmentInvestments: ['equipmentInvestments'] as const,
  otFinancials: ['otFinancials'] as const,
};

/* ------------------------------------------------------------------ */
/*  Admin dashboard stats                                             */
/* ------------------------------------------------------------------ */

interface AdminStats {
  totalUsers: number;
  totalWorkers: number;
  totalMachines: number;
  totalJobs: number;
}

export function useAdminStats() {
  return useQuery<AdminStats>({
    queryKey: queryKeys.adminStats,
    queryFn: async () => {
      const [usersData, workersData, machinesData, jobsData] = await Promise.all([
        supabase.from('user_roles').select('id', { count: 'exact', head: true }),
        supabase.from('employees').select('id', { count: 'exact', head: true }),
        supabase.from('machines').select('id', { count: 'exact', head: true }),
        supabase.from('jobs').select('id', { count: 'exact', head: true }),
      ]);
      return {
        totalUsers: usersData.count ?? 0,
        totalWorkers: workersData.count ?? 0,
        totalMachines: machinesData.count ?? 0,
        totalJobs: jobsData.count ?? 0,
      };
    },
    staleTime: 30_000, // 30s
  });
}

/* ------------------------------------------------------------------ */
/*  Users (via API, admin only)                                       */
/* ------------------------------------------------------------------ */

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: async () => {
      const res = await fetch('/api/admin/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      const json = await res.json();
      return json.users as Array<{
        id: string;
        email: string;
        role: string;
        department: string | null;
        manager_domain: string | null;
      }>;
    },
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      email: string;
      password: string;
      role: string;
      department?: string | null;
      manager_domain?: string | null;
    }) => {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to create user');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.users });
      qc.invalidateQueries({ queryKey: queryKeys.adminStats });
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/users?id=${userId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to delete user');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.users });
      qc.invalidateQueries({ queryKey: queryKeys.adminStats });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Workers                                                           */
/* ------------------------------------------------------------------ */

export function useWorkers() {
  return useQuery({
    queryKey: queryKeys.workers(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select(
          'id, full_name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, lateness_minutes, quality_score, speed_score, overall_rating'
        )
        .order('full_name');
      if (error) throw error;
      return (data ?? []).map((employee: any) => ({
        ...employee,
        name: employee.full_name,
      }));
    },
  });
}

export function useWorkersByRating() {
  return useQuery({
    queryKey: queryKeys.workersByRating,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select(
          'id, full_name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, lateness_minutes, quality_score, speed_score, overall_rating'
        )
        .order('overall_rating', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((employee: any) => ({
        ...employee,
        name: employee.full_name,
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

/* ------------------------------------------------------------------ */
/*  Machines                                                          */
/* ------------------------------------------------------------------ */

export function useMachines() {
  return useQuery({
    queryKey: queryKeys.machines,
    queryFn: async () => {
      const { data, error } = await supabase.from('machines').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Jobs                                                              */
/* ------------------------------------------------------------------ */

export function useJobs() {
  return useQuery<any[]>({
    queryKey: queryKeys.jobs,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, machines(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

/* ------------------------------------------------------------------ */
/*  OTs (work orders)                                                 */
/* ------------------------------------------------------------------ */

export function useOTs() {
  return useQuery({
    queryKey: queryKeys.ots,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ots')
        .select('*, workstation:workstations(*)')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Workflow: shifts, workstations, assignments                       */
/* ------------------------------------------------------------------ */

export function useShifts() {
  return useQuery({
    queryKey: queryKeys.shifts,
    queryFn: async () => {
      const { data, error } = await supabase.from('shifts').select('*').order('start_time');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useWorkstations() {
  return useQuery({
    queryKey: queryKeys.workstations,
    queryFn: async () => {
      const { data, error } = await supabase.from('workstations').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useWorkerAssignments(date?: string) {
  const dateValue = date || new Date().toISOString().split('T')[0];
  return useQuery({
    queryKey: queryKeys.assignments(dateValue),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worker_assignments')
        .select('*, employee:employees(*), workstation:workstations(*), shift:shifts(*)')
        .eq('date', dateValue);
      if (error) throw error;
      return (data ?? []).map((assignment: any) => ({
        ...assignment,
        worker: assignment.employee
          ? {
              ...assignment.employee,
              name: assignment.employee.full_name,
            }
          : null,
        worker_id: assignment.employee?.id ?? assignment.worker_id,
      }));
    },
  });
}

export function useWorkerMonthlyOvertime(referenceDate?: string) {
  const dateValue = referenceDate || new Date().toISOString().split('T')[0];
  const ref = new Date(dateValue);
  const monthStart = new Date(ref.getFullYear(), ref.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const monthEnd = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0];

  return useQuery({
    queryKey: ['assignments', 'monthlyOvertime', monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worker_assignments')
        .select('employee_id, date, role, shift:shifts(start_time, end_time)')
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .ilike('role', '%overtime%');

      if (error) throw error;

      const toMinutes = (timeValue?: string | null) => {
        if (!timeValue) return 0;
        const [hours, minutes] = timeValue.split(':').map(Number);
        return (Number.isNaN(hours) ? 0 : hours) * 60 + (Number.isNaN(minutes) ? 0 : minutes);
      };

      const getShiftHours = (shift: any) => {
        const startMinutes = toMinutes(shift?.start_time);
        const endMinutes = toMinutes(shift?.end_time);
        let durationMinutes = endMinutes - startMinutes;
        if (durationMinutes <= 0) durationMinutes += 24 * 60;
        return durationMinutes / 60;
      };

      const totals: Record<string, { hours: number; shifts: number }> = {};
      const processedShiftKeys = new Set<string>();

      (data ?? []).forEach((assignment: any) => {
        const shiftStart = assignment.shift?.start_time || '';
        const shiftEnd = assignment.shift?.end_time || '';
        const shiftKey = `${assignment.employee_id}-${assignment.date}-${shiftStart}-${shiftEnd}`;

        if (processedShiftKeys.has(shiftKey)) {
          return;
        }
        processedShiftKeys.add(shiftKey);

        const workerId = assignment.employee_id;
        if (!totals[workerId]) {
          totals[workerId] = { hours: 0, shifts: 0 };
        }

        totals[workerId].hours += getShiftHours(assignment.shift);
        totals[workerId].shifts += 1;
      });

      return totals;
    },
    staleTime: 60_000,
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

/* ------------------------------------------------------------------ */
/*  Maintenance                                                       */
/* ------------------------------------------------------------------ */

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
      const { data, error } = await supabase
        .from('maintenance_work_orders')
        .select('status');
      if (error) throw error;
      const rows = data ?? [];
      return {
        pending: rows.filter((r) => r.status === 'pending').length,
        in_progress: rows.filter((r) => r.status === 'in_progress').length,
        completed: rows.filter((r) => r.status === 'completed').length,
        total: rows.length,
      };
    },
    staleTime: 30_000,
  });
}

/* ------------------------------------------------------------------ */
/*  Inventory                                                         */
/* ------------------------------------------------------------------ */

export function useInventory() {
  return useQuery<any[]>({
    queryKey: queryKeys.inventory,
    queryFn: async () => {
      const { data, error } = await supabase.from('inventory' as any).select('*').order('item_name');
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Purchases                                                         */
/* ------------------------------------------------------------------ */

export function usePurchases() {
  return useQuery<any[]>({
    queryKey: queryKeys.purchases,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchases' as any)
        .select('*')
        .order('purchase_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Financial                                                         */
/* ------------------------------------------------------------------ */

export function useMachineCosts() {
  return useQuery({
    queryKey: queryKeys.machineCosts,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('machine_costs')
        .select('*, machines(name, type)');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEquipmentInvestments() {
  return useQuery({
    queryKey: queryKeys.equipmentInvestments,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_investments')
        .select('*, machines(name)');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useOTFinancials() {
  return useQuery({
    queryKey: queryKeys.otFinancials,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ot_financials')
        .select('*, ot:ots(ot_number, client_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
