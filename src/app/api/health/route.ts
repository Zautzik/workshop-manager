import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';

export async function GET() {
	const checks: Record<string, string> = {};

	// 1. Check env vars exist (don't leak values)
	checks.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ set' : '❌ missing';
	checks.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ set' : '❌ missing';
	checks.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? '✅ set' : '❌ missing';
	checks.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ? '✅ set' : '❌ missing';
	checks.NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? '❌ missing';

	// 2. Test Supabase connection
	try {
		const { data, error } = await supabaseAdmin
			.from('clients')
			.select('id')
			.limit(1);

		if (error) {
			checks.supabase_connection = `❌ ${error.message} (code: ${error.code})`;
		} else {
			checks.supabase_connection = `✅ OK (${data?.length ?? 0} row(s) returned)`;
		}
	} catch (e: any) {
		checks.supabase_connection = `❌ Exception: ${e?.message ?? 'unknown'}`;
	}

	return NextResponse.json(checks);
}
