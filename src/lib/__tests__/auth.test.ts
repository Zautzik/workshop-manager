import { describe, it, expect, afterEach, vi } from 'vitest';

/**
 * Dos cosas se prueban acá, separadas porque corren en momentos distintos:
 *
 * 1) Los guardas que corren AL IMPORTAR el módulo (NEXTAUTH_SECRET ausente o
 *    placeholder, y el bypass fuera de desarrollo) — un server que arranca
 *    con el secreto vacío deja que cualquiera firme su propia sesión.
 * 2) El callback `authorize()` de CredentialsProvider, que es donde vive el
 *    login real — se mockean `createClient` (de @supabase/supabase-js, el
 *    cliente de auth) y `supabaseAdmin` (la consulta de rol) para probar la
 *    DECISIÓN, no Supabase.
 *
 * Cada caso recarga el módulo con `vi.resetModules()` porque el guarda del
 * secreto corre una sola vez, al importar.
 */

const REAL_SECRET = 'un-secreto-de-prueba-bien-largo-1234567890';

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
	vi.doUnmock('@supabase/supabase-js');
	vi.doUnmock('@/integrations/supabase/server');
	vi.doUnmock('@/lib/dev-bypass-guard');
});

async function loadAuth(env: {
	secret?: string;
	nodeEnv?: string;
	devBypass?: string;
	supabaseUrl?: string;
	supabaseKey?: string;
} = {}) {
	vi.resetModules();
	vi.stubEnv('NEXTAUTH_SECRET', env.secret ?? REAL_SECRET);
	vi.stubEnv('NODE_ENV', env.nodeEnv ?? '');
	vi.stubEnv('NEXT_PUBLIC_DEV_BYPASS', env.devBypass ?? '');
	vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', env.supabaseUrl ?? 'https://example.supabase.co');
	vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', env.supabaseKey ?? 'anon-key');
	return import('../auth');
}

describe('guarda de NEXTAUTH_SECRET al importar', () => {
	it('con un secreto real, importa limpio', async () => {
		const mod = await loadAuth();
		expect(mod.authOptions.secret).toBe(REAL_SECRET);
		expect(mod.authOptions.session?.strategy).toBe('jwt');
		expect(mod.authOptions.pages?.signIn).toBe('/login');
	});

	it('secreto ausente → lanza al importar', async () => {
		await expect(loadAuth({ secret: '' })).rejects.toThrow(/NEXTAUTH_SECRET/);
	});

	it('secreto = placeholder de .env.example → lanza al importar', async () => {
		await expect(
			loadAuth({ secret: '<generate-a-unique-secret-do-not-copy-this>' }),
		).rejects.toThrow(/NEXTAUTH_SECRET/);
	});

	it('secreto de sólo espacios → lanza (no cuela como "seteado")', async () => {
		await expect(loadAuth({ secret: '   ' })).rejects.toThrow(/NEXTAUTH_SECRET/);
	});
});

describe('guarda del bypass al importar auth.ts', () => {
	it('bypass pedido fuera de development → lanza, incluso con secreto válido', async () => {
		await expect(loadAuth({ nodeEnv: 'production', devBypass: 'true' })).rejects.toThrow(
			/NEXT_PUBLIC_DEV_BYPASS/,
		);
	});

	it('bypass pedido en development → no interfiere con el import', async () => {
		const mod = await loadAuth({ nodeEnv: 'development', devBypass: 'true' });
		expect(mod.authOptions.secret).toBe(REAL_SECRET);
	});
});

describe('authorize() — el login real', () => {
	async function loadAuthorize(opts: {
		signIn?: { data: any; error: any };
		roleRow?: { role: string } | null;
	}) {
		vi.resetModules();
		vi.stubEnv('NEXTAUTH_SECRET', REAL_SECRET);
		vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
		vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'anon-key');

		const signInWithPassword = vi.fn().mockResolvedValue(
			opts.signIn ?? {
				data: {
					user: { id: 'user-1', email: 'ana@taller.cl', user_metadata: { name: 'Ana' } },
					session: { access_token: 'at-1', refresh_token: 'rt-1' },
				},
				error: null,
			},
		);
		vi.doMock('@supabase/supabase-js', () => ({
			createClient: () => ({ auth: { signInWithPassword } }),
		}));

		const maybeSingle = vi.fn().mockResolvedValue({ data: opts.roleRow ?? null, error: null });
		vi.doMock('@/integrations/supabase/server', () => ({
			supabaseAdmin: {
				from: () => ({ select: () => ({ eq: () => ({ order: () => ({ maybeSingle }) }) }) }),
			},
		}));

		const mod = await import('../auth');
		// CredentialsProvider() no spreadea `options` al tope — lo guarda tal
		// cual bajo `.options` y deja `authorize: () => null` como default en
		// el nivel de arriba (node_modules/next-auth/providers/credentials.js).
		// El authorize real que define auth.ts vive en `.options.authorize`.
		const provider = mod.authOptions.providers[0] as unknown as {
			options: { authorize: (credentials: Record<string, string> | undefined) => Promise<any> };
		};
		return { provider: provider.options, signInWithPassword };
	}

	it('sin email o password → rechaza explícitamente, no deja pasar vacío', async () => {
		const { provider } = await loadAuthorize({});
		await expect(provider.authorize(undefined)).rejects.toThrow(/Email and password/);
		await expect(provider.authorize({ email: 'a@b.com' })).rejects.toThrow(/Email and password/);
	});

	it('Supabase rechaza las credenciales → "Invalid credentials", no el error interno', async () => {
		const { provider } = await loadAuthorize({
			signIn: { data: null, error: { message: 'invalid_grant' } },
		});
		await expect(
			provider.authorize({ email: 'ana@taller.cl', password: 'wrong' }),
		).rejects.toThrow('Invalid credentials');
	});

	it('credenciales válidas + fila de rol encontrada → arma el SessionUser completo', async () => {
		const { provider } = await loadAuthorize({ roleRow: { role: 'supervisor' } });
		const user = await provider.authorize({ email: 'ana@taller.cl', password: 'right' });
		expect(user).toMatchObject({
			id: 'user-1',
			email: 'ana@taller.cl',
			name: 'Ana',
			role: 'supervisor',
			supabaseAccessToken: 'at-1',
			supabaseRefreshToken: 'rt-1',
		});
	});

	it('sin fila en user_roles → role queda null, no rompe el login', async () => {
		const { provider } = await loadAuthorize({ roleRow: null });
		const user = await provider.authorize({ email: 'ana@taller.cl', password: 'right' });
		expect(user.role).toBeNull();
	});
});

describe('callbacks jwt/session — el rol tiene que llegar hasta la sesión', () => {
	it('jwt() copia id/rol/tokens del user al token', async () => {
		const mod = await loadAuth();
		const token = await mod.authOptions.callbacks!.jwt!({
			token: {},
			user: {
				id: 'u1',
				role: 'admin',
				supabaseAccessToken: 'at',
				supabaseRefreshToken: 'rt',
			} as any,
		} as any);
		expect(token).toMatchObject({ id: 'u1', role: 'admin', supabaseAccessToken: 'at', supabaseRefreshToken: 'rt' });
	});

	it('jwt() sin user (refresh de token existente) deja el token intacto', async () => {
		const mod = await loadAuth();
		const existing = { id: 'u1', role: 'admin' };
		const token = await mod.authOptions.callbacks!.jwt!({ token: existing } as any);
		expect(token).toBe(existing);
	});

	it('session() propaga id y rol del token a session.user — sin esto, requireAuth() nunca ve el rol', async () => {
		const mod = await loadAuth();
		const session = await mod.authOptions.callbacks!.session!({
			session: { user: {} } as any,
			token: { id: 'u1', role: 'manager' } as any,
		} as any);
		expect((session.user as any)?.id).toBe('u1');
		expect((session.user as any)?.role).toBe('manager');
	});
});
