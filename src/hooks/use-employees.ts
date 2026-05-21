/**
 * HR Domain React Query Hooks
 * 
 * Hooks for querying and managing HR domain entities:
 * - Employees
 * - Employment Contracts
 * - Compensation Rates
 * - Employee Skills
 * - Leave Balances
 * - Leave Requests
 * - Incentive Rules
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Query Keys Factory
 * Used for cache management and prefetching
 */
export const hrQueryKeys = {
	all: ['hr'] as const,
	employees: () => [...hrQueryKeys.all, 'employees'] as const,
	employee: (id: string) => [...hrQueryKeys.employees(), id] as const,
	employeeByWorkerId: (workerId: string) => [
		...hrQueryKeys.all,
		'employeeByWorkerId',
		workerId,
	] as const,
	contracts: () => [...hrQueryKeys.all, 'contracts'] as const,
	contract: (id: string) => [...hrQueryKeys.contracts(), id] as const,
	contractByEmployee: (employeeId: string) => [
		...hrQueryKeys.contracts(),
		'byEmployee',
		employeeId,
	] as const,
	compensation: () => [...hrQueryKeys.all, 'compensation'] as const,
	compensationByEmployee: (employeeId: string) => [
		...hrQueryKeys.compensation(),
		'byEmployee',
		employeeId,
	] as const,
	skills: () => [...hrQueryKeys.all, 'skills'] as const,
	employeeSkills: (employeeId: string) => [
		...hrQueryKeys.all,
		'employeeSkills',
		employeeId,
	] as const,
	leave: () => [...hrQueryKeys.all, 'leave'] as const,
	leaveBalance: (employeeId: string) => [...hrQueryKeys.leave(), 'balance', employeeId] as const,
	leaveRequests: (employeeId: string) => [
		...hrQueryKeys.leave(),
		'requests',
		employeeId,
	] as const,
};

/**
 * Hook: useEmployees
 * Fetch all employees with optional filtering
 */
export function useEmployees(department?: string) {
	return useQuery({
		queryKey: [...hrQueryKeys.employees(), { department }],
		queryFn: async () => {
			const response = await fetch('/api/workers?limit=200', {
				credentials: 'include',
			});

			let payload: any = null;
			try {
				payload = await response.json();
			} catch {
				payload = null;
			}

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to fetch employees');
			}

			// Unwrap paginated envelope { data, total, ... }; fall back to plain array.
			const workers = Array.isArray(payload) ? payload : (payload?.data ?? []);
			if (!department) return workers;

			return workers.filter(
				(worker: any) => String(worker?.department || '') === String(department)
			);
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

/**
 * Hook: useEmployee
 * Fetch single employee by ID
 */
export function useEmployee(id: string) {
	return useQuery({
		queryKey: hrQueryKeys.employee(id),
		queryFn: async () => {
			const { data, error } = await supabase
				.from('employees')
				.select('*')
				.eq('id', id)
				.single();

			if (error) throw error;
			return data;
		},
		enabled: !!id,
		staleTime: 5 * 60 * 1000,
	});
}

/**
 * Hook: useEmployeeByWorkerId
 * Fetch employee by legacy worker_id (for backward compatibility)
 */
export function useEmployeeByWorkerId(workerId: string) {
	return useQuery({
		queryKey: hrQueryKeys.employeeByWorkerId(workerId),
		queryFn: async () => {
			const { data, error } = await supabase
				.from('employees')
				.select('*')
				.eq('worker_legacy_id', workerId)
				.single();

			if (error) throw error;
			return data;
		},
		enabled: !!workerId,
		staleTime: 5 * 60 * 1000,
	});
}

/**
 * Hook: useEmploymentContracts
 * Fetch contracts for an employee
 */
export function useEmploymentContracts(employeeId: string) {
	return useQuery({
		queryKey: hrQueryKeys.contractByEmployee(employeeId),
		queryFn: async () => {
			const { data, error } = await supabase
				.from('employment_contracts')
				.select('*')
				.eq('employee_id', employeeId)
				.order('start_date', { ascending: false });

			if (error) throw error;
			return data || [];
		},
		enabled: !!employeeId,
		staleTime: 5 * 60 * 1000,
	});
}

/**
 * Hook: useCurrentContract
 * Fetch currently active contract for an employee
 */
export function useCurrentContract(employeeId: string) {
	return useQuery({
		queryKey: hrQueryKeys.contractByEmployee(employeeId),
		queryFn: async () => {
			const today = new Date().toISOString().split('T')[0];

			const { data, error } = await supabase
				.from('employment_contracts')
				.select('*')
				.eq('employee_id', employeeId)
				.lte('start_date', today)
				.or(`end_date.is.null,end_date.gte.${today}`)
				.order('start_date', { ascending: false })
				.limit(1)
				.single();

			if (error) throw error;
			return data;
		},
		enabled: !!employeeId,
		staleTime: 5 * 60 * 1000,
	});
}

/**
 * Hook: useCompensationRate
 * Fetch current compensation rate for an employee
 */
export function useCompensationRate(employeeId: string) {
	return useQuery({
		queryKey: hrQueryKeys.compensationByEmployee(employeeId),
		queryFn: async () => {
			const today = new Date().toISOString().split('T')[0];

			const { data, error } = await supabase
				.from('compensation_rates')
				.select('*')
				.eq('employee_id', employeeId)
				.lte('effective_from', today)
				.or(`effective_to.is.null,effective_to.gte.${today}`)
				.order('effective_from', { ascending: false })
				.limit(1)
				.single();

			if (error) throw error;
			return data;
		},
		enabled: !!employeeId,
		staleTime: 10 * 60 * 1000, // Compensation doesn't change often
	});
}

/**
 * Hook: useCompensationHistory
 * Fetch historical compensation rates for an employee
 */
export function useCompensationHistory(employeeId: string) {
	return useQuery({
		queryKey: hrQueryKeys.compensationByEmployee(employeeId),
		queryFn: async () => {
			const { data, error } = await supabase
				.from('compensation_rates')
				.select('*')
				.eq('employee_id', employeeId)
				.order('effective_from', { ascending: false });

			if (error) throw error;
			return data || [];
		},
		enabled: !!employeeId,
		staleTime: 10 * 60 * 1000,
	});
}

/**
 * Hook: useEmployeeSkills
 * Fetch skills for an employee
 */
export function useEmployeeSkills(employeeId: string) {
	return useQuery({
		queryKey: hrQueryKeys.employeeSkills(employeeId),
		queryFn: async () => {
			const { data, error } = await supabase
				.from('employee_skills')
				.select('*')
				.eq('employee_id', employeeId)
				.order('verified_at', { ascending: false });

			if (error) throw error;
			return data || [];
		},
		enabled: !!employeeId,
		staleTime: 5 * 60 * 1000,
	});
}

/**
 * Hook: useLeaveBalance
 * Fetch leave balance for an employee
 */
export function useLeaveBalance(employeeId: string, leaveType?: string) {
	return useQuery({
		queryKey: hrQueryKeys.leaveBalance(employeeId),
		queryFn: async () => {
			let query = supabase
				.from('leave_balances')
				.select('*')
				.eq('employee_id', employeeId)
				.eq('balance_year', new Date().getFullYear());

			if (leaveType) {
				query = query.eq('leave_type', leaveType);
			}

			const { data, error } = await query;

			if (error) throw error;
			return data || [];
		},
		enabled: !!employeeId,
		staleTime: 3 * 60 * 1000, // Leave balances change frequently
	});
}

/**
 * Hook: useLeaveRequests
 * Fetch leave requests for an employee
 */
export function useLeaveRequests(employeeId: string) {
	return useQuery({
		queryKey: hrQueryKeys.leaveRequests(employeeId),
		queryFn: async () => {
			const { data, error } = await supabase
				.from('leave_requests')
				.select('*')
				.eq('employee_id', employeeId)
				.gte('end_date', new Date().toISOString())
				.order('start_date', { ascending: true });

			if (error) throw error;
			return data || [];
		},
		enabled: !!employeeId,
		staleTime: 3 * 60 * 1000,
	});
}

/**
 * Hook: useCreateLeaveRequest
 * Create a new leave request
 */
export function useCreateLeaveRequest() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (data: {
			employee_id: string;
			leave_type: string;
			start_date: string;
			end_date: string;
			hours_requested?: number;
			reason?: string;
		}) => {
			const { data: result, error } = await supabase
				.from('leave_requests')
				.insert([
					{
						employee_id: data.employee_id,
						leave_type: data.leave_type,
						start_date: data.start_date,
						end_date: data.end_date,
						hours_requested: data.hours_requested ?? 0,
						reason: data.reason,
						status: 'pending',
					},
				])
				.select()
				.single();

			if (error) throw error;
			return result;
		},
		onSuccess: (data) => {
			// Invalidate relevant queries
			queryClient.invalidateQueries({
				queryKey: hrQueryKeys.leaveRequests(data.employee_id),
			});
			queryClient.invalidateQueries({
				queryKey: hrQueryKeys.leaveBalance(data.employee_id),
			});
		},
	});
}

/**
 * Hook: useUpdateEmployee
 * Update employee information
 */
export function useUpdateEmployee() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (data: { id: string; [key: string]: any }) => {
			const { id, ...updates } = data;
			const { data: result, error } = await supabase
				.from('employees')
				.update(updates)
				.eq('id', id)
				.select()
				.single();

			if (error) throw error;
			return result;
		},
		onSuccess: (data) => {
			// Invalidate relevant queries
			queryClient.invalidateQueries({ queryKey: hrQueryKeys.employee(data.id) });
			queryClient.invalidateQueries({ queryKey: hrQueryKeys.employees() });
		},
	});
}

export default {
	hrQueryKeys,
	useEmployees,
	useEmployee,
	useEmployeeByWorkerId,
	useEmploymentContracts,
	useCurrentContract,
	useCompensationRate,
	useCompensationHistory,
	useEmployeeSkills,
	useLeaveBalance,
	useLeaveRequests,
	useCreateLeaveRequest,
	useUpdateEmployee,
};
