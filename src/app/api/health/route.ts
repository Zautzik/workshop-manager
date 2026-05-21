import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const runtime = 'nodejs';

/**
 * GET /api/health
 *
 * Unauthenticated liveness + readiness probe for load-balancers and uptime
 * monitors. Verifies the Postgres connection by issuing a lightweight HEAD
 * request (no rows transferred) via PostgREST.
 *
 * Returns HTTP 200 on success, 503 when the DB is unreachable.
 * Does NOT expose env-var values or internal configuration.
 */
export async function GET() {
	const t0 = Date.now();

	const { error } = await supabaseAdmin
		.from('employees')
		.select('id', { count: 'exact', head: true });

	const latencyMs = Date.now() - t0;

	if (error) {
		return NextResponse.json(
			{ status: 'error', db: 'unreachable', error: error.message, latencyMs },
			{ status: 503 }
		);
	}

	return NextResponse.json({ status: 'ok', db: 'ok', latencyMs });
}
