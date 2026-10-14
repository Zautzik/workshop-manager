import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, hasRole, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

// Workers are mutable and auth-gated — never cache at the HTTP layer.
export const dynamic = 'force-dynamic';

// ── Columnas ────────────────────────────────────────────────────────────────
//
// Esta ruta pedía `*`, así que devolvía las 24 columnas de `employees` —
// incluido `badge_code`, que es la credencial que el kiosco de marcaje acepta
// como identidad— a cualquier usuario con sesión, de cualquier rol.
//
// La convención ya existía y esta ruta era la excepción: `useEmployee`
// (`use-employees.ts`) enumera sus columnas y deja escrito que «correo,
// teléfono, contacto de emergencia, notas, fecha de finiquito y `badge_code`
// dejaron de ser legibles por el cliente: se sirven sólo por ruta de servidor
// con control de rol». Esto es esa misma lista, y el control de rol que la
// frase prometía.
const COLUMNAS_OPERATIVAS = [
	'id', 'user_id', 'employee_code', 'full_name', 'department', 'status', 'hire_date',
	'sheets_per_hour', 'teamwork_rating', 'overtime_availability', 'attendance_score',
	'lateness_minutes', 'quality_score', 'speed_score', 'overall_rating',
	'created_at', 'updated_at',
] as const;

// Dato personal y credencial. Sólo administración y RRHH. `PersonasModule`
// muestra correo y teléfono y ya tolera `null`, así que para el resto de los
// roles simplemente no vienen.
const COLUMNAS_SENSIBLES = [
	'email', 'phone', 'emergency_contact_name', 'emergency_contact_phone',
	'notes', 'termination_date', 'badge_code',
] as const;

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

	// Administración y RRHH ven el dato de contacto; el resto, sólo lo operativo.
	const puedeVerDatoPersonal = hasRole(auth.role, ['admin', 'hr_manager']);
	const columnas = [
		...COLUMNAS_OPERATIVAS,
		...(puedeVerDatoPersonal ? COLUMNAS_SENSIBLES : []),
	].join(', ');

	try {
		// Filter terminated/inactive at DB level so count() is accurate for pagination.
		// The OR handles rows where status is NULL (new hires before status is set).
		const { data: employeesData, error: employeesError, count } = await supabaseAdmin
			.from('employees')
			.select(columnas, { count: 'exact' })
			.or('status.is.null,status.not.in.(terminated,inactive)')
			.order('full_name', { ascending: true })
			.range(offset, offset + limit - 1);

		if (!employeesError) {
			const total = count ?? 0;
			const employees = employeesData ?? [];
			const employeeIds = employees.map((employee: any) => employee.id).filter(Boolean);

			let skillsByEmployee = new Map<string, any[]>();
			if (employeeIds.length > 0) {
				const { data: employeeSkills, error: employeeSkillsError } = await supabaseAdmin
					.from('employee_skills')
					.select('employee_id, proficiency_level, certified, certification_expires_on, skill:skills(id, code, name)')
					.in('employee_id', employeeIds);

				if (employeeSkillsError) {
					console.warn('employee_skills query failed in /api/workers:', employeeSkillsError);
				} else {
					skillsByEmployee = (employeeSkills ?? []).reduce((acc: Map<string, any[]>, row: any) => {
						const employeeId = row?.employee_id;
						if (!employeeId) return acc;
						const current = acc.get(employeeId) ?? [];
						current.push(row);
						acc.set(employeeId, current);
						return acc;
					}, new Map<string, any[]>());
				}
			}

			const mapped = employees.map((employee: any) => ({
				...employee,
				name: employee.full_name,
				employee_skills: skillsByEmployee.get(employee.id) ?? [],
			}));
			return NextResponse.json({
				data: mapped,
				total,
				page,
				limit,
				totalPages: Math.ceil(total / limit),
			});
		}

		// La tabla `workers` era una copia de `employees` —378 valores comparados,
		// cero diferencias— y se retiró. Sin segunda tabla no hay plan B: si la
		// consulta a `employees` falla, se dice que falló en vez de servir una
		// versión degradada de la planilla sin sueldos ni competencias.
		console.error('Error fetching workers from employees:', employeesError);
		return NextResponse.json(
			{ error: 'Failed to fetch workers', details: employeesError?.message },
			{ status: 500 }
		);
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
