import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const CreateWorkerSchema = z.object({
	name: z.string().min(1).max(255),
	department: z.string().min(1).max(100),
	status: z.enum(['active', 'inactive', 'on_leave', 'terminated']).optional(),
});

export async function GET(_req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { data: employeesData, error: employeesError } = await supabaseAdmin
			.from('employees')
			.select('*')
			.order('full_name', { ascending: true });

		if (!employeesError) {
			const mapped = (employeesData ?? [])
				.filter((employee: any) => {
					const status = String(employee?.status ?? '').toLowerCase();
					if (!status) return true;
					return status !== 'terminated' && status !== 'inactive';
				})
				.map((employee: any) => ({
					...employee,
					name: employee.full_name,
					employee_skills: Array.isArray(employee?.employee_skills) ? employee.employee_skills : [],
				}));
			return NextResponse.json(mapped);
		}

		console.warn('employees query failed in /api/workers, trying legacy workers fallback:', employeesError);

		const { data: legacyWorkers, error: legacyError } = await supabaseAdmin
			.from('workers' as any)
			.select('*')
			.order('name', { ascending: true });

		if (legacyError) {
			console.error('Error fetching workers from both employees and workers tables:', {
				employeesError,
				legacyError,
			});
			return NextResponse.json(
				{
					error: 'Failed to fetch workers',
					details: {
						employees: employeesError?.message,
						legacy: legacyError?.message,
					},
				},
				{ status: 500 }
			);
		}

		const mappedLegacy = (legacyWorkers ?? []).map((worker: any) => ({
			id: worker.id,
			name: worker.name,
			full_name: worker.name,
			department: worker.department ?? null,
			status: 'active',
			hire_date: worker.created_at ? String(worker.created_at).slice(0, 10) : null,
			employee_skills: [],
			overtime_availability: true,
			attendance_score: null,
			lateness_minutes: null,
			quality_score: null,
			speed_score: null,
			overall_rating: null,
			created_at: worker.created_at,
			updated_at: worker.updated_at,
		}));

		return NextResponse.json(mappedLegacy);
	} catch (error) {
		console.error('Error fetching workers:', error);
		return NextResponse.json({ error: 'Failed to fetch workers', details: String(error) }, { status: 500 });
	}
}

export async function POST(req: NextRequest) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	try {
		const body = await req.json();
		const parsed = CreateWorkerSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const { data, error } = await supabaseAdmin
			.from('employees')
			.insert([
				{
					full_name: parsed.data.name,
					department: parsed.data.department,
					status: parsed.data.status ?? 'active',
					hire_date: new Date().toISOString().split('T')[0],
				},
			])
			.select('id, full_name, department, status')
			.single();

		if (error) {
			console.error('Error creating worker:', error);
			return NextResponse.json({ error: 'Failed to create worker' }, { status: 500 });
		}

		return NextResponse.json(
			{
				...data,
				name: data.full_name,
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error('Error creating worker:', error);
		return NextResponse.json({ error: 'Failed to create worker' }, { status: 500 });
	}
}
