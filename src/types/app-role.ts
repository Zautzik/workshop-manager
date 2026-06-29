/**
 * @fileoverview Application Role Type Definition
 * 
 * SYSTEM ROLE: Role-Based Access Control (RBAC) Type Definition
 * 
 * This file defines the AppRole union type that represents all possible user roles in the system:
 * 
 * - 'supervisor': Oversees daily operations, manages worker teams and job assignments
 * - 'manager': Strategic oversight, manages resources, budgets, and reports
 * - 'hr_manager': Human Resources management, contracts, leave, incentives, certifications
 * - 'admin': Full system access, user management, configurations, system settings
 * - 'technician': Line worker, operates machinery, completes assigned tasks
 * 
 * Every user must have exactly one of these roles.
 * Used throughout the application for access control and UI customization.
 */
export type AppRole = 'supervisor' | 'manager' | 'hr_manager' | 'admin' | 'technician' | 'vendedor';
