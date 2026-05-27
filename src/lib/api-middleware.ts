import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import type { AppRole } from '@/types/app-role';

interface SessionUser {
	id: string;
	email: string;
	name?: string | null;
	role: AppRole | null;
}

/**
 * Retrieve the authenticated user from the NextAuth session.
 * Returns the user object or a NextResponse error (401/403).
 */
export async function requireAuth(
	requiredRoles?: AppRole | AppRole[]
): Promise<SessionUser | NextResponse> {
	// Development bypass — mirrors the client-side bypass in AuthContext.tsx.
	// Both must be enabled together: NODE_ENV=development AND NEXT_PUBLIC_DEV_BYPASS=true.
	// This is intentionally NOT available in production (process.env.NODE_ENV is
	// inlined by Next.js at build time so the dead branch is tree-shaken).
	if (
		process.env.NODE_ENV === 'development' &&
		process.env.NEXT_PUBLIC_DEV_BYPASS === 'true'
	) {
		// Use a valid nil UUID so any route that passes auth.id to a uuid column
		// (e.g. notifications.user_id) doesn't get a Postgres type error.
		return { id: '00000000-0000-0000-0000-000000000000', email: 'dev@local', name: 'Dev Admin', role: 'admin' as const };
	}

	const session = await getServerSession(authOptions);

	if (!session?.user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (requiredRoles) {
		const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
		if (!session.user.role || !roles.includes(session.user.role)) {
			return NextResponse.json(
				{ error: 'Forbidden — insufficient permissions' },
				{ status: 403 }
			);
		}
	}

	return {
		id: session.user.id,
		email: session.user.email ?? '',
		name: session.user.name ?? null,
		role: session.user.role ?? null,
	};
}

/** Check whether the return value from requireAuth is an error response */
export function isAuthError(result: SessionUser | NextResponse): result is NextResponse {
	return result instanceof NextResponse;
}

/** Utility: does the user have one of the allowed roles? */
export function hasRole(
	userRole: AppRole | null | undefined,
	allowedRoles: AppRole | AppRole[]
): boolean {
	if (!userRole) return false;
	const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
	return roles.includes(userRole);
}

export function isAdmin(userRole: AppRole | null | undefined): boolean {
	return userRole === 'admin';
}

export function isSupervisorOrAdmin(userRole: AppRole | null | undefined): boolean {
	return hasRole(userRole, ['admin', 'supervisor']);
}
