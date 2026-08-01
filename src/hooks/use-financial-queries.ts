'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const queryKeys = {
  machineCosts: ['machineCosts'] as const,
  equipmentInvestments: ['equipmentInvestments'] as const,
  otFinancials: ['otFinancials'] as const,
  monthlyPayroll: (year: number, month: number) => ['monthlyPayroll', { year, month }] as const,
  employeeCostTimeline: (employeeId: string, startDate: string, endDate: string, granularity: string) =>
    ['employeeCostTimeline', { employeeId, startDate, endDate, granularity }] as const,
  orderLaborMargin: (otId?: string, startDate?: string, endDate?: string) =>
    ['orderLaborMargin', { otId, startDate, endDate }] as const,
};

function resolveAssignmentEmployeeId(
  assignment: any,
  employeeById: Map<string, any>,
  employeeByLegacyId: Map<string, any>
) {
  if (!assignment) return null;

  const directId = assignment.employee_id ? String(assignment.employee_id) : null;
  if (directId && employeeById.has(directId)) return directId;

  const workerId = assignment.worker_id ? String(assignment.worker_id) : null;
  if (workerId && employeeByLegacyId.has(workerId)) {
    const employee = employeeByLegacyId.get(workerId);
    return String(employee.id);
  }

  if (directId && employeeByLegacyId.has(directId)) {
    const employee = employeeByLegacyId.get(directId);
    return String(employee.id);
  }

  return null;
}

export function useMachineCosts() {
  return useQuery({
    queryKey: queryKeys.machineCosts,
    queryFn: async () => {
      const { data, error } = await supabase.from('machine_costs').select('*, machines(name, type)');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEquipmentInvestments() {
  return useQuery({
    queryKey: queryKeys.equipmentInvestments,
    queryFn: async () => {
      const { data, error } = await supabase.from('equipment_investments').select('*, machines(name)');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * `ot_financials` quedó MIGRADA a `ot_cost_lines` (P1 de la auditoría de
 * Analítica, 2026-08). Tenía 85 filas, ningún endpoint la escribía, y discrepaba
 * con la vista oficial en 85 de 85 OTs — no porque se contradijeran, sino porque
 * el ledger estaba casi vacío de líneas 'actual' y ella no.
 *
 * Este hook ahora es un alias de la puerta única. Se conserva el nombre para no
 * romper a quien lo importe, pero ya no toca la tabla vieja.
 */
export function useOTFinancials() {
  return useOtCostSummary();
}

export interface CostProvenance {
  realLines: number;
  legacyLines: number;
  seedLines: number;
  estimateLines: number;
  /** 0–100: cuánto del costo real no viene de una migración. */
  confidence: number;
  label: string;
}

export interface OtCostSummaryRow {
  ot_id: string;
  ot_number: string;
  client_name: string;
  revenue: number;
  estimated_cost: number;
  actual_cost: number;
  material_actual: number;
  labor_actual: number;
  machine_actual: number;
  other_actual: number;
  gross_margin: number;
  margin_pct: number | null;
  /** De dónde salió cada peso. Un margen sin esto es una opinión. */
  provenance: CostProvenance;
  /** El margen existe pero no sirve para decidir precios. */
  unreliable: boolean;
}

export interface OtCostTotals {
  ots_total: number;
  ots_confiables: number;
  ots_descartadas: number;
  revenue: number;
  actual_cost: number;
  estimated_cost: number;
  gross_margin: number;
  margin_pct: number | null;
  reason: string;
}

/** Puerta única del costo por OT: ledger unificado con procedencia. */
export function useOtCostSummary(opts: { includeSeed?: boolean } = {}) {
  const qs = opts.includeSeed ? '?include_seed=1' : '';
  return useQuery<OtCostSummaryRow[]>({
    queryKey: ['otCostSummary', !!opts.includeSeed],
    queryFn: async () => {
      const res = await fetch(`/api/ots/cost-summary${qs}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to fetch cost summary: ${res.status}`);
      const payload = await res.json();
      return (payload?.data ?? []) as OtCostSummaryRow[];
    },
  });
}

/** Totales del período, con el motivo de qué quedó dentro y qué no. */
export function useOtCostTotals(opts: { includeSeed?: boolean } = {}) {
  const qs = opts.includeSeed ? '?include_seed=1' : '';
  return useQuery<OtCostTotals | null>({
    queryKey: ['otCostTotals', !!opts.includeSeed],
    queryFn: async () => {
      const res = await fetch(`/api/ots/cost-summary${qs}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to fetch cost totals: ${res.status}`);
      const payload = await res.json();
      return (payload?.totals ?? null) as OtCostTotals | null;
    },
  });
}

export function useMonthlyPayroll(year: number, month: number) {
  const safeYear = Number.isFinite(year) ? Math.trunc(year) : NaN;
  const safeMonth = Number.isFinite(month) ? Math.trunc(month) : NaN;
  const hasValidParams =
    Number.isInteger(safeYear) &&
    safeYear >= 1900 &&
    safeYear <= 9999 &&
    Number.isInteger(safeMonth) &&
    safeMonth >= 1 &&
    safeMonth <= 12;

  return useQuery({
    queryKey: queryKeys.monthlyPayroll(safeYear, safeMonth),
    queryFn: async () => {
      if (!hasValidParams) return [];

      const monthStart = `${safeYear}-${String(safeMonth).padStart(2, '0')}-01`;
      const monthEnd = new Date(safeYear, safeMonth, 0).toISOString().split('T')[0];

      const [employeesRes, assignmentsRes, compensationRes, incentivesRes] = await Promise.all([
        supabase.from('employees').select('id, full_name, worker_legacy_id'),
        supabase
          .from('worker_assignments')
          .select('employee_id, worker_id, date, role, shift:shifts(start_time, end_time)')
          .gte('date', monthStart)
          .lte('date', monthEnd),
        supabase
          .from('compensation_rates')
          .select(
            'employee_id, hourly_rate, overtime_multiplier_50, overtime_multiplier_100, night_shift_multiplier, weekend_multiplier, currency_code, effective_from, effective_to'
          ),
        supabase
          .from('employee_incentives')
          .select('employee_id, amount, currency_code, status, awarded_date')
          .gte('awarded_date', monthStart)
          .lte('awarded_date', monthEnd)
          .in('status', ['approved', 'paid']),
      ]);

      if (employeesRes.error) throw employeesRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;
      if (compensationRes.error) throw compensationRes.error;
      if (incentivesRes.error) throw incentivesRes.error;

      const employees = employeesRes.data ?? [];
      const assignments = assignmentsRes.data ?? [];
      const compensationRates = compensationRes.data ?? [];
      const incentives = incentivesRes.data ?? [];

      const employeeById = new Map<string, any>();
      const employeeByLegacyId = new Map<string, any>();
      employees.forEach((employee: any) => {
        if (employee?.id) employeeById.set(employee.id, employee);
        if (employee?.worker_legacy_id) {
          employeeByLegacyId.set(String(employee.worker_legacy_id), employee);
        }
      });

      const ratesByEmployee = new Map<string, any[]>();
      compensationRates.forEach((rate: any) => {
        const employeeId = rate?.employee_id;
        if (!employeeId) return;
        const existing = ratesByEmployee.get(employeeId) || [];
        existing.push(rate);
        ratesByEmployee.set(employeeId, existing);
      });

      ratesByEmployee.forEach((rates) => {
        rates.sort((a, b) => String(b?.effective_from || '').localeCompare(String(a?.effective_from || '')));
      });

      const findRateForDate = (employeeId: string, assignmentDate: string) => {
        const rates = ratesByEmployee.get(employeeId) || [];
        return rates.find((rate: any) => {
          const from = String(rate?.effective_from || '0000-01-01');
          const to = rate?.effective_to ? String(rate.effective_to) : null;
          return from <= assignmentDate && (!to || to >= assignmentDate);
        });
      };

      const toMinutes = (timeValue?: string | null) => {
        if (!timeValue) return 0;
        const [hours, minutes] = String(timeValue).split(':').map(Number);
        return (Number.isNaN(hours) ? 0 : hours) * 60 + (Number.isNaN(minutes) ? 0 : minutes);
      };

      const getShiftHours = (shift: any) => {
        const startMinutes = toMinutes(shift?.start_time);
        const endMinutes = toMinutes(shift?.end_time);
        let durationMinutes = endMinutes - startMinutes;
        if (durationMinutes <= 0) durationMinutes += 24 * 60;
        return durationMinutes / 60;
      };

      const isNightShift = (shift: any) => {
        const startMinutes = toMinutes(shift?.start_time);
        const endMinutes = toMinutes(shift?.end_time);
        const nightStart = 20 * 60;
        const nightEnd = 6 * 60;
        return (
          startMinutes >= nightStart ||
          startMinutes < nightEnd ||
          endMinutes >= nightStart ||
          endMinutes < nightEnd
        );
      };

      const rowsByEmployee = new Map<string, any>();
      const unresolvedAssignments: string[] = [];
      const assignmentsMissingRate: string[] = [];

      assignments.forEach((assignment: any) => {
        const employeeId = resolveAssignmentEmployeeId(assignment, employeeById, employeeByLegacyId);
        if (!employeeId || !assignment?.date) {
          unresolvedAssignments.push(
            `${assignment?.date || 'unknown-date'}|emp:${assignment?.employee_id || 'null'}|worker:${assignment?.worker_id || 'null'}`
          );
          return;
        }

        const employee = employeeById.get(employeeId);

        const activeRate = findRateForDate(employeeId, String(assignment.date));
        if (!activeRate) {
          assignmentsMissingRate.push(`${assignment.date}|emp:${employeeId}`);
          return;
        }

        const hours = getShiftHours(assignment.shift);
        const overtime = String(assignment?.role || '').toLowerCase().includes('overtime');
        const ot100 = String(assignment?.role || '').includes('100');
        const weekend = [0, 6].includes(new Date(String(assignment.date)).getDay());
        const night = isNightShift(assignment.shift);

        const hourlyRate = Number(activeRate?.hourly_rate || 0);
        const ot50Multiplier = Number(activeRate?.overtime_multiplier_50 || 1.5);
        const ot100Multiplier = Number(activeRate?.overtime_multiplier_100 || 2);
        const nightMultiplier = Number(activeRate?.night_shift_multiplier || 1);
        const weekendMultiplier = Number(activeRate?.weekend_multiplier || 1);
        const currencyCode = activeRate?.currency_code || 'CLP';

        const regularHours = overtime ? 0 : hours;
        const overtimeHours = overtime ? hours : 0;
        const basePay = regularHours * hourlyRate;
        const overtimePay = overtime
          ? overtimeHours * hourlyRate * (ot100 ? ot100Multiplier : ot50Multiplier)
          : 0;
        const nightDifferential = night ? hours * hourlyRate * Math.max(0, nightMultiplier - 1) : 0;
        const weekendDifferential = weekend ? hours * hourlyRate * Math.max(0, weekendMultiplier - 1) : 0;

        const existing = rowsByEmployee.get(employeeId) || {
          employee_id: employeeId,
          employee_name: employee?.full_name || 'Unknown employee',
          regular_hours: 0,
          overtime_hours: 0,
          base_pay: 0,
          overtime_pay: 0,
          night_differential: 0,
          weekend_differential: 0,
          incentives: 0,
          gross_pay: 0,
          currency_code: currencyCode,
          assignments_count: 0,
        };

        existing.regular_hours += regularHours;
        existing.overtime_hours += overtimeHours;
        existing.base_pay += basePay;
        existing.overtime_pay += overtimePay;
        existing.night_differential += nightDifferential;
        existing.weekend_differential += weekendDifferential;
        existing.assignments_count += 1;
        existing.currency_code = existing.currency_code || currencyCode;
        rowsByEmployee.set(employeeId, existing);
      });

      // Resilient: skip what can't be mapped/priced rather than aborting the
      // whole payroll. The clot-fix migration backfills employee_id so these
      // become rare; the circulation vital surfaces any that remain.
      if (unresolvedAssignments.length > 0) {
        console.warn(
          `Payroll: skipped ${unresolvedAssignments.length} assignment(s) not mapped to an employee. Example: ${unresolvedAssignments[0]}`
        );
      }

      if (assignmentsMissingRate.length > 0) {
        console.warn(
          `Payroll: skipped ${assignmentsMissingRate.length} assignment(s) with no active compensation rate. Example: ${assignmentsMissingRate[0]}`
        );
      }

      incentives.forEach((incentive: any) => {
        const employeeId = incentive?.employee_id;
        if (!employeeId) return;
        const employee = employeeById.get(employeeId);
        const existing = rowsByEmployee.get(employeeId) || {
          employee_id: employeeId,
          employee_name: employee?.full_name || 'Unknown employee',
          regular_hours: 0,
          overtime_hours: 0,
          base_pay: 0,
          overtime_pay: 0,
          night_differential: 0,
          weekend_differential: 0,
          incentives: 0,
          gross_pay: 0,
          currency_code: incentive?.currency_code || 'CLP',
          assignments_count: 0,
        };
        existing.incentives += Number(incentive?.amount || 0);
        if (!existing.currency_code) {
          existing.currency_code = incentive?.currency_code || 'CLP';
        }
        rowsByEmployee.set(employeeId, existing);
      });

      const fallbackRows = Array.from(rowsByEmployee.values()).map((row: any) => {
        const gross =
          Number(row.base_pay || 0) +
          Number(row.overtime_pay || 0) +
          Number(row.night_differential || 0) +
          Number(row.weekend_differential || 0) +
          Number(row.incentives || 0);
        return {
          ...row,
          gross_pay: gross,
        };
      });

      return fallbackRows.sort((a: any, b: any) =>
        String(a.employee_name || '').localeCompare(String(b.employee_name || ''))
      );
    },
    enabled: hasValidParams,
  });
}

export interface EmployeeCostTimelineRow {
  period_start: string;
  period_end: string;
  employee_id: string;
  employee_name: string;
  base_hours: number;
  ot50_hours: number;
  ot100_hours: number;
  night_hours: number;
  weekend_hours: number;
  base_pay: number;
  ot50_pay: number;
  ot100_pay: number;
  night_differential: number;
  weekend_differential: number;
  overtime_premium: number;
  incentive_pay: number;
  total_labor_cost: number;
}

export function useEmployeeCostTimeline(
  employeeId: string,
  startDate: string,
  endDate: string,
  granularity: 'week' | 'month' = 'month'
) {
  return useQuery<EmployeeCostTimelineRow[]>({
    queryKey: queryKeys.employeeCostTimeline(employeeId, startDate, endDate, granularity),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_employee_cost_timeline', {
        p_employee_id: employeeId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_granularity: granularity,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!employeeId && !!startDate && !!endDate,
  });
}

export interface OrderLaborMarginRow {
  ot_id: string;
  ot_number: string;
  client_name: string;
  order_date: string;
  completion_date: string | null;
  revenue: number;
  base_labor_cost: number;
  overtime_premium: number;
  night_differential: number;
  weekend_differential: number;
  total_labor_cost: number;
  incentive_cost: number;
  total_cost: number;
  gross_margin: number;
  margin_percentage: number;
  labor_hours: number;
  overtime_hours: number;
  cost_per_hour: number;
}

export function useOrderLaborMargin(otId?: string, startDate?: string, endDate?: string) {
  const hasValidStartDate = Boolean(startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate));
  const hasValidEndDate = Boolean(endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate));

  return useQuery<OrderLaborMarginRow[]>({
    queryKey: queryKeys.orderLaborMargin(otId, startDate, endDate),
    queryFn: async () => {
      let otsQuery = supabase.from('ots').select('id, ot_number, client_name, created_at, completed_at, total_price');

      if (otId) {
        otsQuery = otsQuery.eq('id', otId);
      }

      const { data: rawOts, error: otsError } = await otsQuery;
      if (otsError) throw otsError;

      const normalizedOts = (rawOts ?? []).map((ot: any) => {
        const orderDate = ot?.order_date
          ? String(ot.order_date)
          : ot?.created_at
            ? String(ot.created_at).slice(0, 10)
            : null;
        const completionDate = ot?.completion_date
          ? String(ot.completion_date)
          : ot?.completed_at
            ? String(ot.completed_at).slice(0, 10)
            : null;
        return {
          ...ot,
          order_date: orderDate,
          completion_date: completionDate,
        };
      });

      const filteredOts = normalizedOts.filter((ot: any) => {
        const orderDate = ot?.order_date ? String(ot.order_date) : null;
        const completionDate = ot?.completion_date ? String(ot.completion_date) : null;

        if (hasValidStartDate && startDate && orderDate && orderDate < startDate) {
          return false;
        }

        if (hasValidEndDate && endDate) {
          if (completionDate) {
            if (completionDate > endDate) return false;
          } else if (orderDate && orderDate > endDate) {
            return false;
          }
        }

        return true;
      });

      if (filteredOts.length === 0) return [];

      const otIds = filteredOts.map((ot: any) => ot.id).filter(Boolean);

      // El ingreso sale de `ots.total_price`, que es donde el taller lo fija.
      // Antes venía de `ot_financials.revenue`, una copia que discrepaba en
      // $4.151.430 del total y que ya está migrada (P1 de la auditoría).
      const revenueByOt = new Map<string, number>();
      filteredOts.forEach((ot: any) => {
        if (ot?.id) revenueByOt.set(ot.id, Number(ot?.total_price || 0));
      });

      let assignmentsQuery = supabase
        .from('worker_assignments')
        .select('ot_id, employee_id, worker_id, date, role, shift:shifts(start_time, end_time)')
        .in('ot_id', otIds);

      if (hasValidStartDate && startDate) {
        assignmentsQuery = assignmentsQuery.gte('date', startDate);
      }
      if (hasValidEndDate && endDate) {
        assignmentsQuery = assignmentsQuery.lte('date', endDate);
      }

      const [assignmentsRes, employeesRes, compensationRes, incentivesRes] = await Promise.all([
        assignmentsQuery,
        supabase.from('employees').select('id, worker_legacy_id'),
        supabase
          .from('compensation_rates')
          .select(
            'employee_id, hourly_rate, overtime_multiplier_50, overtime_multiplier_100, night_shift_multiplier, weekend_multiplier, effective_from, effective_to'
          ),
        supabase
          .from('employee_incentives')
          .select('employee_id, amount, status, awarded_date')
          .in('status', ['approved', 'paid'])
          .gte('awarded_date', hasValidStartDate && startDate ? startDate : '1900-01-01')
          .lte('awarded_date', hasValidEndDate && endDate ? endDate : '2999-12-31'),
      ]);

      if (assignmentsRes.error) throw assignmentsRes.error;
      if (employeesRes.error) throw employeesRes.error;
      if (compensationRes.error) throw compensationRes.error;
      if (incentivesRes.error) throw incentivesRes.error;

      const assignments = assignmentsRes.data ?? [];
      const employees = employeesRes.data ?? [];
      const compensationRates = compensationRes.data ?? [];
      const incentives = incentivesRes.data ?? [];

      const employeeById = new Map<string, any>();
      const employeeByLegacyId = new Map<string, any>();
      employees.forEach((employee: any) => {
        if (employee?.id) {
          employeeById.set(String(employee.id), employee);
        }
        if (employee?.worker_legacy_id && employee?.id) {
          employeeByLegacyId.set(String(employee.worker_legacy_id), employee);
        }
      });

      const ratesByEmployee = new Map<string, any[]>();
      compensationRates.forEach((rate: any) => {
        if (!rate?.employee_id) return;
        const list = ratesByEmployee.get(rate.employee_id) || [];
        list.push(rate);
        ratesByEmployee.set(rate.employee_id, list);
      });

      ratesByEmployee.forEach((rates) => {
        rates.sort((a, b) => String(b?.effective_from || '').localeCompare(String(a?.effective_from || '')));
      });

      const findRateForDate = (employeeId: string, assignmentDate: string) => {
        const rates = ratesByEmployee.get(employeeId) || [];
        return rates.find((rate: any) => {
          const from = String(rate?.effective_from || '0000-01-01');
          const to = rate?.effective_to ? String(rate.effective_to) : null;
          return from <= assignmentDate && (!to || to >= assignmentDate);
        });
      };

      const incentivesByEmployeeDate = new Map<string, number>();
      incentives.forEach((incentive: any) => {
        const employeeId = incentive?.employee_id;
        const awardedDate = incentive?.awarded_date;
        if (!employeeId || !awardedDate) return;
        const key = `${employeeId}:${awardedDate}`;
        incentivesByEmployeeDate.set(key, (incentivesByEmployeeDate.get(key) || 0) + Number(incentive?.amount || 0));
      });

      const toMinutes = (timeValue?: string | null) => {
        if (!timeValue) return 0;
        const [hours, minutes] = String(timeValue).split(':').map(Number);
        return (Number.isNaN(hours) ? 0 : hours) * 60 + (Number.isNaN(minutes) ? 0 : minutes);
      };

      const getShiftHours = (shift: any) => {
        const startMinutes = toMinutes(shift?.start_time);
        const endMinutes = toMinutes(shift?.end_time);
        let durationMinutes = endMinutes - startMinutes;
        if (durationMinutes <= 0) durationMinutes += 24 * 60;
        return durationMinutes / 60;
      };

      const isNightShift = (shift: any) => {
        const startMinutes = toMinutes(shift?.start_time);
        const endMinutes = toMinutes(shift?.end_time);
        const nightStart = 20 * 60;
        const nightEnd = 6 * 60;
        return startMinutes >= nightStart || startMinutes < nightEnd || endMinutes >= nightStart || endMinutes < nightEnd;
      };

      const rowsByOt = new Map<
        string,
        {
          base_labor_cost: number;
          overtime_premium: number;
          night_differential: number;
          weekend_differential: number;
          total_labor_cost: number;
          incentive_cost: number;
          labor_hours: number;
          overtime_hours: number;
        }
      >();

      const incentiveAppliedPerOtEmployeeDate = new Set<string>();
      const unresolvedAssignments: string[] = [];
      const assignmentsMissingRate: string[] = [];

      assignments.forEach((assignment: any) => {
        const orderId = assignment?.ot_id;
        if (!orderId) return;

        const employeeId = resolveAssignmentEmployeeId(assignment, employeeById, employeeByLegacyId);
        if (!employeeId || !assignment?.date) {
          unresolvedAssignments.push(
            `${orderId}|${assignment?.date || 'unknown-date'}|emp:${assignment?.employee_id || 'null'}|worker:${assignment?.worker_id || 'null'}`
          );
          return;
        }

        const rate = findRateForDate(employeeId, String(assignment.date));
        if (!rate) {
          assignmentsMissingRate.push(`${orderId}|${assignment.date}|emp:${employeeId}`);
          return;
        }
        const hourlyRate = Number(rate?.hourly_rate || 0);
        const overtimeMultiplier50 = Number(rate?.overtime_multiplier_50 || 1.5);
        const overtimeMultiplier100 = Number(rate?.overtime_multiplier_100 || 2);
        const nightMultiplier = Number(rate?.night_shift_multiplier || 1);
        const weekendMultiplier = Number(rate?.weekend_multiplier || 1);

        const hours = getShiftHours(assignment.shift);
        const isOvertime = String(assignment?.role || '').toLowerCase().includes('overtime');
        const isOT100 = String(assignment?.role || '').includes('100');
        const weekend = [0, 6].includes(new Date(String(assignment.date)).getDay());
        const night = isNightShift(assignment.shift);

        const baseCost = isOvertime ? 0 : hours * hourlyRate;
        const overtimeCost = isOvertime
          ? hours * hourlyRate * (isOT100 ? overtimeMultiplier100 : overtimeMultiplier50)
          : 0;
        const nightDiff = night ? hours * hourlyRate * Math.max(0, nightMultiplier - 1) : 0;
        const weekendDiff = weekend ? hours * hourlyRate * Math.max(0, weekendMultiplier - 1) : 0;

        const existing = rowsByOt.get(orderId) || {
          base_labor_cost: 0,
          overtime_premium: 0,
          night_differential: 0,
          weekend_differential: 0,
          total_labor_cost: 0,
          incentive_cost: 0,
          labor_hours: 0,
          overtime_hours: 0,
        };

        existing.base_labor_cost += baseCost;
        existing.overtime_premium += overtimeCost;
        existing.night_differential += nightDiff;
        existing.weekend_differential += weekendDiff;
        existing.total_labor_cost += baseCost + overtimeCost + nightDiff + weekendDiff;
        existing.labor_hours += hours;
        if (isOvertime) existing.overtime_hours += hours;

        const incentiveKey = `${orderId}:${employeeId}:${assignment.date}`;
        if (!incentiveAppliedPerOtEmployeeDate.has(incentiveKey)) {
          const incentiveAmount = incentivesByEmployeeDate.get(`${employeeId}:${assignment.date}`) || 0;
          existing.incentive_cost += incentiveAmount;
          incentiveAppliedPerOtEmployeeDate.add(incentiveKey);
        }

        rowsByOt.set(orderId, existing);
      });

      // Resilient: skip unmappable/unpriced assignments instead of aborting.
      if (unresolvedAssignments.length > 0) {
        console.warn(
          `Order labor margin: skipped ${unresolvedAssignments.length} assignment(s) not mapped to an employee. Example: ${unresolvedAssignments[0]}`
        );
      }

      if (assignmentsMissingRate.length > 0) {
        console.warn(
          `Order labor margin: skipped ${assignmentsMissingRate.length} assignment(s) with no active compensation rate. Example: ${assignmentsMissingRate[0]}`
        );
      }

      return filteredOts
        .map((ot: any) => {
          const costs = rowsByOt.get(ot.id) || {
            base_labor_cost: 0,
            overtime_premium: 0,
            night_differential: 0,
            weekend_differential: 0,
            total_labor_cost: 0,
            incentive_cost: 0,
            labor_hours: 0,
            overtime_hours: 0,
          };

          const revenue = revenueByOt.has(ot.id) ? Number(revenueByOt.get(ot.id) || 0) : Number(ot?.revenue || 0);
          const totalCost = costs.total_labor_cost + costs.incentive_cost;
          const grossMargin = revenue - totalCost;
          const marginPercentage = revenue > 0 ? (grossMargin / revenue) * 100 : 0;
          const costPerHour = costs.labor_hours > 0 ? costs.total_labor_cost / costs.labor_hours : 0;

          return {
            ot_id: ot.id,
            ot_number: ot.ot_number,
            client_name: ot.client_name,
            order_date: ot.order_date,
            completion_date: ot.completion_date,
            revenue,
            base_labor_cost: costs.base_labor_cost,
            overtime_premium: costs.overtime_premium,
            night_differential: costs.night_differential,
            weekend_differential: costs.weekend_differential,
            total_labor_cost: costs.total_labor_cost,
            incentive_cost: costs.incentive_cost,
            total_cost: totalCost,
            gross_margin: grossMargin,
            margin_percentage: marginPercentage,
            labor_hours: costs.labor_hours,
            overtime_hours: costs.overtime_hours,
            cost_per_hour: costPerHour,
          } as OrderLaborMarginRow;
        })
        .sort((a, b) => {
          const dateDiff = String(b.order_date || '').localeCompare(String(a.order_date || ''));
          if (dateDiff !== 0) return dateDiff;
          return String(a.ot_number || '').localeCompare(String(b.ot_number || ''));
        });
    },
    enabled: hasValidStartDate && hasValidEndDate,
  });
}
