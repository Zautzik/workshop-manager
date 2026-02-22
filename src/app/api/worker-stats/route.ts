import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export async function GET(request: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { searchParams } = new URL(request.url);
		const department = searchParams.get('department');

		let query = supabaseAdmin.from('worker_stats').select('*');
		if (department && department !== 'all') {
			query = query.eq('department', department);
		}

		const { data, error } = await query.order('efficiency_score', { ascending: false });
		if (error) {
			if (error.code === 'PGRST204') {
				const { data: workers, error: workersError } = await supabaseAdmin
					.from('employees')
					.select('id, full_name, department, sheets_per_hour, teamwork_rating, overtime_availability, attendance_score, lateness_minutes, quality_score, speed_score, overall_rating')
					.order('full_name', { ascending: true });

				if (workersError) {
					console.error('Error fetching workers fallback:', workersError);
					return NextResponse.json({ error: 'Failed to fetch worker stats' }, { status: 500 });
				}

				const fallback = (workers ?? []).map((worker) => ({
					...worker,
					name: worker.full_name,
					total_tasks: 0,
					avg_time_minutes: 0,
					avg_rating: 0,
					efficiency_score: 0,
					overall_rating: worker.overall_rating ?? 0,
					sheets_per_hour: worker.sheets_per_hour ?? 0,
					teamwork_rating: worker.teamwork_rating ?? 0,
					quality_score: worker.quality_score ?? 0,
					speed_score: worker.speed_score ?? 0,
					attendance_score: worker.attendance_score ?? 0,
					overtime_availability: worker.overtime_availability ?? false,
					lateness_minutes: worker.lateness_minutes ?? 0,
				}));

				return NextResponse.json(fallback);
			}

			console.error('Error fetching worker stats:', error);
			return NextResponse.json({ error: 'Failed to fetch worker stats' }, { status: 500 });
		}

		return NextResponse.json(data ?? []);
	} catch (error) {
		console.error('Error fetching worker stats:', error);
		return NextResponse.json({ error: 'Failed to fetch worker stats' }, { status: 500 });
	}
}
