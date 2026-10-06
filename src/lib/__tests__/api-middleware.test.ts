import { describe, it, expect, afterEach, vi } from 'vitest';

/**
 * `requireAuth` depende de NextAuth (`getServerSession`), del bypass de
 * desarrollo (`isDevBypassEnabled`) y de Supabase (`supabaseAdmin`, sólo
 * para resolver el usuario del bypass) — las tres se mockean para probar la
 * DECISIÓN de autorización, no esas dependencias. Cada test recarga el
 * módulo con `vi.resetModules()` porque el estado del bypass se decide por
 * import, y porque `resolveDevBypassUser()` cachea su resultado a nivel de
 * módulo (justamente eso también se prueba abajo).
 */

afterEach(() => {
	vi.resetModules();
	vi.doUnmock('@/lib/dev-bypass-guard');
	vi.doUnmock('@/lib/auth');
	vi.doUnmock('next-auth');
	vi.doUnmock('@/integrations/supabase/server');
	vi.unstubAllEnvs();
});

interface LoadOpts {
	devBypass?: boolean;
	session?: { user?: { id: string; email?: string; name?: string; role?: string | null } } | null;
	adminLookup?: { user_id: string } | null;
}

async function loadMiddleware(opts: LoadOpts = {}) {
	vi.resetModules();
	const maybeSingle = vi.fn().mockResolvedValue({ data: opts.adminLookup ?? null, error: null });
	const getServerSession = vi.fn().mockResolvedValue(opts.session ?? null);

	vi.doMock('@/lib/dev-bypass-guard', () => ({ isDevBypassEnabled: !!opts.devBypass }));
	vi.doMock('@/lib/auth', () => ({ authOptions: {} }));
	vi.doMock('next-auth', () => ({ getServerSession }));
	vi.doMock('@/integrations/supabase/server', () => ({
		supabaseAdmin: {
			from: () => ({ select: () => ({ eq: () => ({ limit: () => ({ maybeSingle }) }) }) }),
		},
	}));

	const mw = await import('../api-middleware');
	return { mw, maybeSingle, getServerSession };
}

describe('helpers puros de rol', () => {
	it('isAdmin sólo es verdadero para "admin"', async () => {
		const { mw } = await loadMiddleware();
		expect(mw.isAdmin('admin')).toBe(true);
		expect(mw.isAdmin('manager')).toBe(false);
		expect(mw.isAdmin(null)).toBe(false);
		expect(mw.isAdmin(undefined)).toBe(false);
	});

	it('hasRole acepta un rol único o una lista', async () => {
		const { mw } = await loadMiddleware();
		expect(mw.hasRole('supervisor', 'supervisor')).toBe(true);
		expect(mw.hasRole('supervisor', ['admin', 'supervisor'])).toBe(true);
		expect(mw.hasRole('vendedor', ['admin', 'supervisor'])).toBe(false);
		expect(mw.hasRole(null, ['admin'])).toBe(false);
	});

	it('isSupervisorOrAdmin excluye explícitamente a manager', async () => {
		const { mw } = await loadMiddleware();
		expect(mw.isSupervisorOrAdmin('admin')).toBe(true);
		expect(mw.isSupervisorOrAdmin('supervisor')).toBe(true);
		expect(mw.isSupervisorOrAdmin('manager')).toBe(false);
	});

	it('isAuthError distingue un SessionUser de una respuesta de error real', async () => {
		const { mw } = await loadMiddleware({ devBypass: false, session: null });
		const sinSesion = await mw.requireAuth();
		expect(mw.isAuthError(sinSesion)).toBe(true);
		// un objeto con forma de SessionUser nunca es instancia de NextResponse
		expect(mw.isAuthError({ id: 'u1', email: 'a@b.com', role: 'admin' } as any)).toBe(false);
	});
});

describe('requireAuth — sin bypass, vía NextAuth', () => {
	it('sin sesión → 401', async () => {
		const { mw } = await loadMiddleware({ devBypass: false, session: null });
		const res = await mw.requireAuth();
		expect(mw.isAuthError(res)).toBe(true);
		if (mw.isAuthError(res)) {
			expect(res.status).toBe(401);
			expect((await res.json()).error).toBe('Unauthorized');
		}
	});

	it('con sesión pero sin el rol exigido → 403', async () => {
		const { mw } = await loadMiddleware({
			devBypass: false,
			session: { user: { id: 'u1', email: 'a@b.com', role: 'vendedor' } },
		});
		const res = await mw.requireAuth(['admin', 'supervisor']);
		expect(mw.isAuthError(res)).toBe(true);
		if (mw.isAuthError(res)) expect(res.status).toBe(403);
	});

	it('sesión sin rol asignado (role: null) con requiredRoles → 403, no pasa por "undefined ∈ roles"', async () => {
		const { mw } = await loadMiddleware({
			devBypass: false,
			session: { user: { id: 'u1', email: 'a@b.com', role: null } },
		});
		const res = await mw.requireAuth(['admin']);
		expect(mw.isAuthError(res)).toBe(true);
		if (mw.isAuthError(res)) expect(res.status).toBe(403);
	});

	it('con sesión y rol permitido → devuelve el SessionUser', async () => {
		const { mw } = await loadMiddleware({
			devBypass: false,
			session: { user: { id: 'u1', email: 'a@b.com', name: 'Ana', role: 'admin' } },
		});
		const res = await mw.requireAuth(['admin']);
		expect(mw.isAuthError(res)).toBe(false);
		if (!mw.isAuthError(res)) {
			expect(res).toEqual({ id: 'u1', email: 'a@b.com', name: 'Ana', role: 'admin' });
		}
	});

	it('sin requiredRoles, cualquier sesión válida pasa sin mirar el rol', async () => {
		const { mw } = await loadMiddleware({
			devBypass: false,
			session: { user: { id: 'u1', email: 'a@b.com', role: 'technician' } },
		});
		const res = await mw.requireAuth();
		expect(mw.isAuthError(res)).toBe(false);
	});
});

describe('requireAuth — bypass de desarrollo', () => {
	it('con DEV_BYPASS_USER_ID seteado, no consulta Supabase', async () => {
		vi.stubEnv('DEV_BYPASS_USER_ID', 'env-user-123');
		const { mw, maybeSingle } = await loadMiddleware({ devBypass: true });
		const res = await mw.requireAuth();
		expect(mw.isAuthError(res)).toBe(false);
		if (!mw.isAuthError(res)) expect(res.id).toBe('env-user-123');
		expect(maybeSingle).not.toHaveBeenCalled();
	});

	it('sin DEV_BYPASS_USER_ID, busca el primer admin en user_roles', async () => {
		const { mw, maybeSingle } = await loadMiddleware({
			devBypass: true,
			adminLookup: { user_id: 'admin-real-id' },
		});
		const res = await mw.requireAuth();
		expect(mw.isAuthError(res)).toBe(false);
		if (!mw.isAuthError(res)) expect(res.id).toBe('admin-real-id');
		expect(maybeSingle).toHaveBeenCalledTimes(1);
	});

	it('sin env y sin admin en la base, cae al UUID nulo (no rompe lecturas)', async () => {
		const { mw } = await loadMiddleware({ devBypass: true, adminLookup: null });
		const res = await mw.requireAuth();
		expect(mw.isAuthError(res)).toBe(false);
		if (!mw.isAuthError(res)) expect(res.id).toBe('00000000-0000-0000-0000-000000000000');
	});

	it('el resultado se cachea: una segunda llamada no vuelve a consultar Supabase', async () => {
		const { mw, maybeSingle } = await loadMiddleware({
			devBypass: true,
			adminLookup: { user_id: 'admin-real-id' },
		});
		await mw.requireAuth();
		await mw.requireAuth();
		expect(maybeSingle).toHaveBeenCalledTimes(1);
	});

	it('el bypass nunca mira roles exigidos — siempre es admin', async () => {
		const { mw } = await loadMiddleware({ devBypass: true, adminLookup: { user_id: 'x' } });
		const res = await mw.requireAuth(['admin']);
		expect(mw.isAuthError(res)).toBe(false);
	});
});
