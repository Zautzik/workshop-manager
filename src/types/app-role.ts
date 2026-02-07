/**
 * @fileoverview Application Role Type Definition
 * 
 * SYSTEM ROLE: Role-Based Access Control (RBAC) Type Definition
 * ORGAN ANALOGY: The "Job Classification System" - Defines all user role types
 * 
 * This file defines the AppRole union type that represents all possible user roles in the system:
 * 
 * - 'supervisor': Oversees daily operations, manages worker teams and job assignments
 * - 'manager': Strategic oversight, manages resources, budgets, and reports
 * - 'admin': Full system access, user management, configurations, system settings
 * - 'technician': Line worker, operates machinery, completes assigned tasks
 * 
 * Every user must have exactly one of these roles.
 * Used throughout the application for access control and UI customization.
 */
export type AppRole = 'supervisor' | 'manager' | 'admin' | 'technician';
