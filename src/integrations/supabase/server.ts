import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Authorization architecture — single enforcement point
 *
 * Every API route uses `supabaseAdmin` (service role key), which bypasses
 * Row Level Security (RLS) by design.  Authorization is enforced exclusively
 * at the application layer via `requireAuth()` in src/lib/api-middleware.ts,
 * which validates the NextAuth session and role before any DB access.
 *
 * The 268 RLS policies in supabase/migrations/ act as a defence-in-depth
 * layer for direct DB access (psql, pgAdmin, Supabase dashboard queries)
 * and are NOT the primary enforcement mechanism for API requests.
 *
 * Do NOT add a second anon/authenticated Supabase client to enforce RLS
 * inside API routes — that would create two competing auth systems.
 * If you want RLS as the primary mechanism, switch all routes to a
 * per-request client built from the user's JWT and remove requireAuth().
 *
 * Connection pooling note:
 * This client communicates with Postgres exclusively via PostgREST (HTTP),
 * so there are no direct TCP connections to Postgres from the app server.
 * Connection pooling is managed by Supabase's own infrastructure.
 * If you ever add a direct pg/postgres client (e.g. for migrations or
 * raw SQL), use the Supabase pooler URL (port 6543, PgBouncer) instead
 * of the direct URL (port 5432) to avoid exhausting connections under
 * serverless/concurrent load.
 */

let client: SupabaseClient<Database> | null = null;

/**
 * Build the client on first use, not on import.
 *
 * `next build` evaluates every route module to collect page data, so a client
 * constructed at module scope demanded the service-role key at *build* time —
 * and CI, which legitimately has no production secrets, could never get past
 * it (`supabaseUrl is required`, collecting /api/…). The env is read here for
 * the same reason: a deploy that injects it at runtime is no longer racing the
 * import.
 *
 * Missing config now throws on the first query instead: one failed request with
 * a message that names the variable, rather than a build nobody can complete.
 */
function getClient(): SupabaseClient<Database> {
	if (client) return client;

	const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
	if (!url || !serviceRoleKey) {
		throw new Error(
			'Faltan variables de entorno de Supabase: NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY.'
		);
	}

	client = createClient<Database>(url, serviceRoleKey, {
		auth: {
			persistSession: false,
			// server-side: no storage
			storage: undefined,
		},
		global: {
			// disable fetch polyfills; use the runtime's fetch
		},
	});
	return client;
}

/**
 * Server-side Supabase client using the service role key. Do NOT expose this to
 * the browser.
 *
 * A proxy so the 133 modules that `import { supabaseAdmin }` keep calling it as
 * a plain client — `supabaseAdmin.from(…)` — while construction stays deferred
 * to that first property access. Methods are bound to the real client, which
 * supabase-js needs to keep its internal `this`.
 */
export const supabaseAdmin = new Proxy({} as SupabaseClient<Database>, {
	get(_target, prop) {
		const real = getClient();
		const value = Reflect.get(real, prop, real);
		return typeof value === 'function' ? value.bind(real) : value;
	},
	set(_target, prop, value) {
		return Reflect.set(getClient(), prop, value);
	},
	has(_target, prop) {
		return Reflect.has(getClient(), prop);
	},
});

export default supabaseAdmin;
