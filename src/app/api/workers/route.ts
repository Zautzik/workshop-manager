import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

// Workers are mutable and auth-gated — never cache at the HTTP layer.
export const dynamic = 'force-dynamic';

const CreateWorkerSchema = z.object({
	name: z.string().min(1).max(255),
	department: z.string().min(1).max(100),
	status: z.enum(['active', 'inactive', 'on_leave', 'terminated']).optional(),
});

// ── Pagination ──────────────────────────────────────────────────────────────
const PageSchema = z.object({
	page:  z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { searchParams } = new URL(req.url);
	const pagination = PageSchema.safeParse(Object.fromEntries(searchParams));
	if (!pagination.success) {
		return NextResponse.json(
			{ error: 'Invalid pagination params', details: pagination.error.flatten().fieldErrors },
			{ status: 400 }
		);
	}
	const { page, limit } = pagination.data;
	const offset = (page - 1) * limit;

	try {
		// Filter terminated/inactive at DB level so count() is accurate for pagination.
		// The OR handles rows where status is NULL (new hires before status is set).
		const { data: employeesData, error: employeesError, count } = await supabaseAdmin
			.from('employees')
			.select('*', { count: 'exact' })
			.or('status.is.null,status.not.in.(terminated,inactive)')
			.order('full_name', { ascending: true })
			.range(offset, offset + limit - 1);

		if (!employeesError) {
			const total = count ?? 0;
			const mapped = (employeesData ?? []).map((employee: any) => ({
				...employee,
				name: employee.full_name,
				employee_skills: Array.isArray(employee?.employee_skills) ? employee.employee_skills : [],
			}));
			return NextResponse.json({
				data: mapped,
				total,
				page,
				limit,
				totalPages: Math.ceil(total / limit),
			});
		}

		console.warn('employees query failed in /api/workers, trying legacy workers fallback:', employeesError);

		const { data: legacyWorkers, error: legacyError, count: legacyCount } = await supabaseAdmin
			.from('workers' as any)
			.select('*', { count: 'exact' })
			.order('name', { ascending: true })
			.range(offset, offset + limit - 1);

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

		const legacyTotal = legacyCount ?? 0;
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

		return NextResponse.json({
			data: mappedLegacy,
			total: legacyTotal,
			page,
			limit,
			totalPages: Math.ceil(legacyTotal / limit),
		});
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
