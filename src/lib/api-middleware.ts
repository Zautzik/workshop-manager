import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import type { AppRole } from '@/types/app-role';
import { isDevBypassEnabled } from '@/lib/dev-bypass-guard';
import { supabaseAdmin } from '@/integrations/supabase/server';

interface SessionUser {
	id: string;
	email: string;
	name?: string | null;
	role: AppRole | null;
}

// Dev bypass must impersonate a REAL user: several tables FK their *_by /
// recorded_by columns to auth.users, so the old nil-UUID stand-in made every
// such insert 500 in dev (2026-07 audit). Resolution order: DEV_BYPASS_USER_ID
// env var, else the first admin in user_roles. Cached after first lookup.
let devBypassUser: SessionUser | null = null;
async function resolveDevBypassUser(): Promise<SessionUser> {
	if (devBypassUser) return devBypassUser;

	let id = process.env.DEV_BYPASS_USER_ID ?? null;
	if (!id) {
		const { data, error } = await supabaseAdmin
			.from('user_roles')
			.select('user_id')
			.eq('role', 'admin')
			.limit(1)
			.maybeSingle();
		if (error) console.error('[dev-bypass] admin lookup failed:', error);
		id = data?.user_id ?? null;
	}

	const user = {
		// Nil UUID only as a last resort (empty database) — FK inserts will fail
		// there, but reads keep working.
		id: id ?? '00000000-0000-0000-0000-000000000000',
		email: 'dev@local',
		name: 'Dev Admin',
		role: 'admin' as const,
	};
	// Sólo se recuerda un admin real. Antes se guardaba también el UUID nulo:
	// si la base local estaba caída en el primer pedido (Docker apagado), el
	// servidor quedaba hasta reiniciarse escribiendo con un usuario que no
	// existe, y toda salida de papel o línea de costo fallaba por FK
	// (2026-11-12).
	if (id) devBypassUser = user;
	return user;
}

/**
 * Retrieve the authenticated user from the NextAuth session.
 * Returns the user object or a NextResponse error (401/403).
 */
export async function requireAuth(
	requiredRoles?: AppRole | AppRole[]
): Promise<SessionUser | NextResponse> {
	// Development bypass — mirrors the client-side bypass in AuthContext.tsx.
	// Safety assertion runs at module load via auth.ts import chain.
	if (isDevBypassEnabled) {
		return resolveDevBypassUser();
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
