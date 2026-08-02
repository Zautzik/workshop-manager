/**
 * HR Context Hooks
 * 
 * Convenience hooks for working with HR domain context
 */

import {
	useHRContext,
	useCurrentEmployeeHR,
} from '@/contexts/HRContext';
import {
	useEmployees,
	useEmployee,
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
	useEmployees,
	useEmployee,
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
