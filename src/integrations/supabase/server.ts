import { createClient } from '@supabase/supabase-js';
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

const SUPABASE_URL =
	process.env.NEXT_PUBLIC_SUPABASE_URL ||
	process.env.SUPABASE_URL ||
	'';
const SUPABASE_SERVICE_ROLE_KEY =
	process.env.SUPABASE_SERVICE_ROLE_KEY ||
	'';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
	console.error(
		'⚠️  Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. API calls will fail.'
	);
}

// Server-side Supabase client using the service role key. Do NOT expose this to the browser.
export const supabaseAdmin = createClient<Database>(
	SUPABASE_URL,
	SUPABASE_SERVICE_ROLE_KEY,
	{
		auth: {
			persistSession: false,
			// server-side: no storage
			storage: undefined,
		},
		global: {
			// disable fetch polyfills; use the runtime's fetch
		},
	}
);

export default supabaseAdmin;
