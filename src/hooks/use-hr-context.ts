/**
 * HR Context Hooks
 * 
 * Convenience hooks for working with HR domain context
 */

import {
	useHRContext,
	useCurrentEmployeeHR,
	useEmployeeByWorkerIdHR,
} from '@/contexts/HRContext';
import {
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
	hrQueryKeys,
} from '@/hooks/use-employees';

/**
 * Hook: useDepartmentEmployees
 * Get all employees in current department context
 */
export function useDepartmentEmployees() {
	const { currentDepartment } = useHRContext();
	return useEmployees(currentDepartment);
}

/**
 * Hook: useCurrentEmployeeFull
 * Get complete current employee profile
 */
export function useCurrentEmployeeFull() {
	return useCurrentEmployeeHR();
}

/**
 * Hook: useEmployeeFullProfile
 * Get complete employee profile by ID
 */
export function useEmployeeFullProfile(employeeId: string) {
	const employee = useEmployee(employeeId);
	const contracts = useEmploymentContracts(employeeId);
	const currentContract = useCurrentContract(employeeId);
	const compensation = useCompensationRate(employeeId);
	const compensationHistory = useCompensationHistory(employeeId);
	const skills = useEmployeeSkills(employeeId);
	const leaveBalance = useLeaveBalance(employeeId);
	const leaveRequests = useLeaveRequests(employeeId);

	return {
		employee: employee.data,
		contracts: contracts.data,
		currentContract: currentContract.data,
		compensation: compensation.data,
		compensationHistory: compensationHistory.data,
		skills: skills.data,
		leaveBalance: leaveBalance.data,
		leaveRequests: leaveRequests.data,
		isLoading:
			employee.isLoading ||
			contracts.isLoading ||
			currentContract.isLoading ||
			compensation.isLoading ||
			compensationHistory.isLoading ||
			skills.isLoading ||
			leaveBalance.isLoading ||
			leaveRequests.isLoading,
		error:
			employee.error ||
			contracts.error ||
			currentContract.error ||
			compensation.error ||
			compensationHistory.error ||
			skills.error ||
			leaveBalance.error ||
			leaveRequests.error,
	};
}

/**
 * Hook: useWorkerLegacyProfile
 * Get employee profile using legacy worker ID (backward compatibility)
 */
export function useWorkerLegacyProfile(workerId: string) {
	const legacyEmployee = useEmployeeByWorkerId(workerId);
	const employee = useEmployee(legacyEmployee.data?.id || '');
	const contracts = useEmploymentContracts(legacyEmployee.data?.id || '');
	const currentContract = useCurrentContract(legacyEmployee.data?.id || '');
	const compensation = useCompensationRate(legacyEmployee.data?.id || '');

	return {
		employee: employee.data,
		legacyWorkerId: workerId,
		contracts: contracts.data,
		currentContract: currentContract.data,
		compensation: compensation.data,
		isLoading:
			legacyEmployee.isLoading ||
			employee.isLoading ||
			contracts.isLoading ||
			currentContract.isLoading ||
			compensation.isLoading,
		error:
			legacyEmployee.error ||
			employee.error ||
			contracts.error ||
			currentContract.error ||
			compensation.error,
	};
}

/**
 * Hook: useLeaveManagement
 * Get leave balance and request capabilities for an employee
 */
export function useLeaveManagement(employeeId: string) {
	const leaveBalance = useLeaveBalance(employeeId);
	const leaveRequests = useLeaveRequests(employeeId);
	const createLeaveRequest = useCreateLeaveRequest();

	return {
		balance: leaveBalance.data,
		requests: leaveRequests.data,
		createRequest: createLeaveRequest.mutate,
		isCreatingRequest: createLeaveRequest.isPending,
		isLoading: leaveBalance.isLoading || leaveRequests.isLoading,
		error: leaveBalance.error || leaveRequests.error,
	};
}

/**
 * Hook: useCompensationOverview
 * Get current and historical compensation data
 */
export function useCompensationOverview(employeeId: string) {
	const current = useCompensationRate(employeeId);
	const history = useCompensationHistory(employeeId);

	return {
		current: current.data,
		history: history.data,
		isLoading: current.isLoading || history.isLoading,
		error: current.error || history.error,
	};
}

/**
 * Export commonly used items
 */
export {
	useHRContext,
	useCurrentEmployeeHR,
	useEmployeeByWorkerIdHR,
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
	hrQueryKeys,
};
