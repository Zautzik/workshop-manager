import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import type { AppRole } from '@/types/app-role';

export interface AuthenticatedRequest extends NextRequest {
	user: {
		id: string;
		email: string;
		name?: string | null;
		role?: AppRole | null;
	};
}

/**
 * Middleware to protect API routes and verify authentication
 */
export async function withAuth(
	handler: (req: AuthenticatedRequest) => Promise<NextResponse>,
	options?: {
		requireRole?: AppRole | AppRole[];
	}
) {
	return async (req: NextRequest): Promise<NextResponse> => {
		const session = await getServerSession(authOptions);

		if (!session?.user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Check role requirements
		if (options?.requireRole) {
			const requiredRoles = Array.isArray(options.requireRole)
				? options.requireRole
				: [options.requireRole];

			if (!session.user.role || !requiredRoles.includes(session.user.role)) {
				return NextResponse.json(
					{ error: 'Forbidden - Insufficient permissions' },
					{ status: 403 }
				);
			}
		}

		// Attach user to request
		const authenticatedReq = req as AuthenticatedRequest;
		authenticatedReq.user = session.user;

		return handler(authenticatedReq);
	};
}

/**
 * Utility to check if user has specific role
 */
export function hasRole(
	userRole: AppRole | null | undefined,
	allowedRoles: AppRole | AppRole[]
): boolean {
	if (!userRole) return false;

	const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
	return roles.includes(userRole);
}

/**
 * Check if user is admin
 */
export function isAdmin(userRole: AppRole | null | undefined): boolean {
	return userRole === 'admin';
}

/**
 * Check if user is supervisor or admin
 */
export function isSupervisorOrAdmin(
	userRole: AppRole | null | undefined
): boolean {
	return hasRole(userRole, ['admin', 'supervisor']);
}
