/**
 * @fileoverview Application Role Type Definition
 *
 * SYSTEM ROLE: Role-Based Access Control (RBAC) Type Definition
 *
 * The roles a user can hold:
 *
 * - 'supervisor':  Oversees daily operations, manages worker teams and job assignments
 * - 'manager':     Strategic oversight, manages resources, budgets, and reports
 * - 'hr_manager':  Human Resources — contracts, leave, incentives, certifications
 * - 'admin':       Full system access, user management, configurations, system settings
 * - 'technician':  Line worker, operates machinery, completes assigned tasks
 * - 'vendedor':    Sales — quotes, vistos buenos, follows their own orders
 *
 * Every user must have exactly one of these roles.
 *
 * ── Why the list is a runtime array and not just a union ───────────────────
 *
 * It used to be only a type, so every place that needed the list at runtime
 * wrote its own copy — and they drifted. On 2026-10-13 there were three:
 * `UserManagement.tsx` declared a local `AppRole` without 'vendedor', and the
 * two Zod enums in `/api/admin/users` (POST and PATCH) omitted it as well.
 * `role-transitions` had the full list. The result: `vendedor` existed in the
 * API, in the state machine and in the RLS policies, but could not be assigned
 * to anybody — the Users screen could not offer it and the API would have
 * rejected it anyway.
 *
 * Deriving the type FROM the array means a role added here reaches the Zod
 * schemas and the pickers without anyone remembering to update them. This is
 * the "two of everything" pattern NOTES.md §5 names as the repository's most
 * persistent; one source is how it stops.
 */

/**
 * The single source of truth for the role list.
 *
 * `as const` makes this a readonly tuple, which is what `z.enum()` needs — so
 * API schemas can write `z.enum(APP_ROLES)` instead of retyping the literals.
 */
export const APP_ROLES = [
	'supervisor',
	'manager',
	'hr_manager',
	'admin',
	'technician',
	'vendedor',
] as const;

export type AppRole = (typeof APP_ROLES)[number];
