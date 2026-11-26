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

/**
 * Query Keys Factory
 * Used for cache management and prefetching
 */
export const hrQueryKeys = {
	all: ['hr'] as const,
	employees: () => [...hrQueryKeys.all, 'employees'] as const,
	employee: (id: string) => [...hrQueryKeys.employees(), id] as const,
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

// useEmployee, contracts, compensation, skills and leave hooks read the HR
// tables straight from the browser and had no callers; removed with the
// server-read sweep (audit H5, 2026-11-26). Read through the HR API routes.

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
			const res = await fetch('/api/leave-requests', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					employee_id: data.employee_id,
					leave_type: data.leave_type,
					start_date: data.start_date,
					end_date: data.end_date,
					hours_requested: data.hours_requested ?? 0,
					reason: data.reason,
				}),
			});

			const result = await res.json().catch(() => null);
			if (!res.ok) {
				throw new Error(result?.error || 'No se pudo crear la solicitud');
			}
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
			const res = await fetch(`/api/employees/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(updates),
			});

			const payload = await res.json().catch(() => null);
			if (!res.ok) {
				throw new Error(payload?.error || 'No se pudo actualizar el empleado');
			}
			return payload?.data ?? payload;
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
	useCreateLeaveRequest,
	useUpdateEmployee,
};
