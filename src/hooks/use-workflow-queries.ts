'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const queryKeys = {
  ots: ['ots'] as const,
  workersByRating: ['workers', 'rating'] as const,
  shifts: ['shifts'] as const,
  workstations: ['workstations'] as const,
  assignments: (date?: string) => ['assignments', { date }] as const,
  compensationRates: (date?: string) => ['compensationRates', { date }] as const,
  schedulingCostModel: ['schedulingCostModel'] as const,
  workflowLeaveStatuses: (date?: string) => ['workflowLeaveStatuses', { date }] as const,
  workflowIncentives: (monthKey?: string) => ['workflowIncentives', { monthKey }] as const,
  workflowCertAlerts: (date?: string) => ['workflowCertAlerts', { date }] as const,
  workflowContracts: (date?: string) => ['workflowContracts', { date }] as const,
  workflowWeeklyHours: (weekStart?: string, weekEnd?: string) => ['workflowWeeklyHours', { weekStart, weekEnd }] as const,
  inventoryItems: ['inventory', 'items'] as const,
};

const OT_SELECT = `
  *,
  workstation:workstations(*),
  machine:machines!assigned_machine_id(id,name,type)
` as const;

const SCHEDULE_SELECT = `
  *,
  ot:ots(
    id, ot_number, client_name, product_name, description,
    quantity, color_front, color_back, pantone_colors,
    status, deadline, proceso_actual,
    flag_ord, flag_pro, flag_vbp, flag_plan, flag_paper_arrived,
    calc_print_hours, calc_finish_hours,
    finish_troquelado, finish_plegado, finish_pegado, finish_laminado,
    finish_barniz, finish_relieve, finish_perforado, finish_hot_stamping,
    finish_uv_localizado, finish_numeracion
  ),
  machine:machines(id, name, type, status)
` as const;

export const activeOTStatuses = [
  'pre_press',
  'visto_bueno',
  'paper_purchase',
  'in_storage',
  'guillotine_first_cut',
  'offset_printing',
  'die_cutting',
  'guillotine_final_cut',
  'workshop',
  'outsourced',
  'workshop_revision',
  'ready_for_delivery',
  'in_delivery',
] as const;

export function useWorkersByRating() {
  return useQuery({
    queryKey: queryKeys.workersByRating,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select(
          'id, full_name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, lateness_minutes, quality_score, speed_score, overall_rating, employee_skills(proficiency_level, certified, skill:skills(code, name, category))'
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

export function useMachines() {
  return useQuery({
    queryKey: ['machines'],
    queryFn: async () => {
      const { data, error } = await supabase.from('machines').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useOTs() {
  return useQuery({
    queryKey: queryKeys.ots,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ots')
        .select(OT_SELECT)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useActiveOTs() {
  return useQuery({
    queryKey: [...queryKeys.ots, 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ots')
        .select(OT_SELECT)
        .in('status', activeOTStatuses as unknown as string[])
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDaySchedule(date: string) {
  return useQuery({
    queryKey: ['schedule', 'day', date],
    queryFn: async () => {
      const dayStart = `${date}T00:00:00.000Z`;
      const dayEnd = `${date}T23:59:59.999Z`;
      const { data, error } = await supabase
        .from('ot_machine_schedule')
        .select(SCHEDULE_SELECT)
        .gte('scheduled_start', dayStart)
        .lte('scheduled_start', dayEnd)
        .order('sort_order', { ascending: true })
        .order('scheduled_start', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!date,
  });
}

export function useWeekSchedule(weekStart: string) {
  return useQuery({
    queryKey: ['schedule', 'week', weekStart],
    queryFn: async () => {
      const res = await fetch(`/api/ot-schedule/week?start=${weekStart}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Failed to fetch weekly schedule');
      }
      return res.json() as Promise<{
        week_start: string;
        week_end: string;
        days: string[];
        shift_hours: number;
        published_snapshot: {
          id: string;
          version: number;
          published_at: string;
          week_start: string;
          week_end: string;
        } | null;
        machine_rows: Array<{
          machine: { id: string; name: string; type: string; status: string };
          days: Array<{
            date: string;
            slots: any[];
            planned_hours: number;
            is_overloaded: boolean;
          }>;
          slot_count: number;
          planned_hours_total: number;
          overloaded_days: number;
        }>;
        unscheduled: any[];
      }>;
    },
    enabled: !!weekStart,
  });
}

export function useUnscheduledOTs(date: string) {
  return useQuery({
    queryKey: ['schedule', 'unscheduled', date],
    queryFn: async () => {
      const dayStart = `${date}T00:00:00.000Z`;
      const dayEnd = `${date}T23:59:59.999Z`;

      const { data: slots } = await supabase
        .from('ot_machine_schedule')
        .select('ot_id')
        .gte('scheduled_start', dayStart)
        .lte('scheduled_start', dayEnd);

      const scheduledIds = (slots ?? []).map((slot: any) => slot.ot_id);

      let query = supabase
        .from('ots')
        .select(OT_SELECT)
        .in('status', activeOTStatuses as unknown as string[])
        .order('priority', { ascending: false });

      if (scheduledIds.length > 0) {
        query = query.not('id', 'in', `(${scheduledIds.join(',')})`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!date,
  });
}

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

export function useCompensationRatesForDate(date?: string) {
  const dateValue = date || new Date().toISOString().split('T')[0];
  return useQuery({
    queryKey: queryKeys.compensationRates(dateValue),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compensation_rates')
        .select(
          'employee_id, hourly_rate, currency_code, overtime_multiplier_50, overtime_multiplier_100, night_shift_multiplier, weekend_multiplier, effective_from, effective_to'
        )
        .lte('effective_from', dateValue)
        .or(`effective_to.is.null,effective_to.gte.${dateValue}`);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSchedulingCostModel() {
  return useQuery({
    queryKey: queryKeys.schedulingCostModel,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scheduling_cost_models')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
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

export function useWorkflowLeaveStatuses(referenceDate?: string) {
  const dateValue = referenceDate || new Date().toISOString().split('T')[0];
  return useQuery({
    queryKey: queryKeys.workflowLeaveStatuses(dateValue),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('employee_id, leave_type, status, start_date, end_date')
        .lte('start_date', dateValue)
        .gte('end_date', dateValue)
        .in('status', ['approved', 'pending']);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useWorkflowIncentiveStatuses(referenceDate?: string) {
  const dateValue = referenceDate || new Date().toISOString().split('T')[0];
  const ref = new Date(dateValue);
  const monthStart = new Date(ref.getFullYear(), ref.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const monthEnd = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0];

  return useQuery({
    queryKey: queryKeys.workflowIncentives(`${monthStart}:${monthEnd}`),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_incentives')
        .select('employee_id, status, awarded_date, amount')
        .gte('awarded_date', monthStart)
        .lte('awarded_date', monthEnd);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useWorkflowCertificationAlerts(referenceDate?: string) {
  const dateValue = referenceDate || new Date().toISOString().split('T')[0];
  const cutoff = new Date(dateValue);
  cutoff.setDate(cutoff.getDate() + 30);
  const cutoffDate = cutoff.toISOString().split('T')[0];

  return useQuery({
    queryKey: queryKeys.workflowCertAlerts(dateValue),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_documents')
        .select('employee_id, title, status, expires_on, doc_type')
        .eq('doc_type', 'certification')
        .not('expires_on', 'is', null)
        .lte('expires_on', cutoffDate)
        .neq('status', 'archived');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useWorkflowContracts(referenceDate?: string) {
  const dateValue = referenceDate || new Date().toISOString().split('T')[0];
  return useQuery({
    queryKey: queryKeys.workflowContracts(dateValue),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employment_contracts')
        .select('*')
        .order('id', { ascending: false });
      if (error) throw error;

      const normalized = (data ?? []).map((contract: any) => {
        const start = contract.contract_start_date ?? contract.start_date ?? null;
        const end = contract.contract_end_date ?? contract.end_date ?? null;
        return {
          ...contract,
          contract_start_date: start,
          contract_end_date: end,
        };
      });

      return normalized
        .filter((contract: any) => {
          const start = contract.contract_start_date;
          const end = contract.contract_end_date;

          const startsBeforeOrOnDate = !start || String(start) <= dateValue;
          const endsAfterOrOnDate = !end || String(end) >= dateValue;

          return startsBeforeOrOnDate && endsAfterOrOnDate;
        })
        .sort((a: any, b: any) => {
          const aStart = String(a.contract_start_date || '');
          const bStart = String(b.contract_start_date || '');
          return bStart.localeCompare(aStart);
        });
    },
  });
}

export function useWorkflowWeeklyHours(referenceDate?: string) {
  const dateValue = referenceDate || new Date().toISOString().split('T')[0];
  const refDate = new Date(dateValue);
  const day = refDate.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const weekStartDate = new Date(refDate);
  weekStartDate.setDate(refDate.getDate() + diffToMonday);
  weekStartDate.setHours(0, 0, 0, 0);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + 6);

  const weekStart = weekStartDate.toISOString().split('T')[0];
  const weekEnd = weekEndDate.toISOString().split('T')[0];

  return useQuery({
    queryKey: queryKeys.workflowWeeklyHours(weekStart, weekEnd),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worker_assignments')
        .select('employee_id, shift:shifts(start_time, end_time)')
        .gte('date', weekStart)
        .lte('date', weekEnd);
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

      const totals: Record<string, number> = {};
      (data ?? []).forEach((assignment: any) => {
        const workerId = assignment.employee_id;
        if (!workerId) return;
        totals[workerId] = (totals[workerId] || 0) + getShiftHours(assignment.shift);
      });

      return totals;
    },
    staleTime: 60_000,
  });
}

export function useInventoryItems() {
  return useQuery<any[]>({
    queryKey: queryKeys.inventoryItems,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_items_stock_v' as any)
        .select('*')
        .order('name');
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}
