'use client';

/**
 * HR Domain Context
 * 
 * Provides HR-related state and utilities across the application:
 * - Current employee information
 * - Department context
 * - Compensation and contract details
 * - Permission checks for HR operations
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { useEmployee, useCurrentContract, useCompensationRate } from '@/hooks/use-employees';

interface HRContextType {
	currentEmployeeId?: string;
	currentDepartment?: string;
	setCurrentEmployee: (employeeId: string) => void;
	setCurrentDepartment: (department: string) => void;
	canManageHR: boolean;
	canViewPayroll: boolean;
}

const HRContext = createContext<HRContextType | undefined>(undefined);

interface HRProviderProps {
	children: ReactNode;
	employeeId?: string;
	department?: string;
	canManageHR?: boolean;
	canViewPayroll?: boolean;
}

/**
 * HR Context Provider
 * Wrap your application with this provider to enable HR features
 */
export function HRProvider({
	children,
	employeeId,
	department,
	canManageHR = false,
	canViewPayroll = false,
}: HRProviderProps) {
	const [currentEmployeeId, setCurrentEmployeeId] = React.useState<string | undefined>(employeeId);
	const [currentDepartment, setCurrentDepartment] = React.useState<string | undefined>(
		department
	);

	const value: HRContextType = {
		currentEmployeeId,
		currentDepartment,
		setCurrentEmployee: setCurrentEmployeeId,
		setCurrentDepartment,
		canManageHR,
		canViewPayroll,
	};

	return <HRContext.Provider value={value}>{children}</HRContext.Provider>;
}

/**
 * Hook: useHRContext
 * Access HR domain context from anywhere in the app
 */
export function useHRContext(): HRContextType {
	const context = useContext(HRContext);
	if (!context) {
		throw new Error('useHRContext must be used within HRProvider');
	}
	return context;
}

/**
 * Hook: useCurrentEmployeeHR
 * Get full employee profile with contract and compensation
 */
export function useCurrentEmployeeHR() {
	const { currentEmployeeId } = useHRContext();
	const employee = useEmployee(currentEmployeeId || '');
	const contract = useCurrentContract(currentEmployeeId || '');
	const compensation = useCompensationRate(currentEmployeeId || '');

	return {
		employee: employee.data,
		contract: contract.data,
		compensation: compensation.data,
		isLoading: employee.isLoading || contract.isLoading || compensation.isLoading,
		error: employee.error || contract.error || compensation.error,
	};
}


export default HRContext;
