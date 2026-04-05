import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

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
