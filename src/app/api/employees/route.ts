/**
 * Employees API Route
 * 
 * Endpoints:
 * - GET /api/employees - List employees
 * - POST /api/employees - Create employee
 * - GET /api/employees/:id - Get employee details
 * - PUT /api/employees/:id - Update employee
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { hasRole, isAuthError, requireAuth } from '@/lib/api-middleware';
import type { Json } from '@/integrations/supabase/types';

const PERSONAL_EMPLOYEE_FIELDS = [
	'email',
	'phone',
	'emergency_contact_name',
	'emergency_contact_phone',
	'notes',
	'termination_date',
] as const;

// Allowed values for the `status` filter — validates user-supplied query input
// instead of trusting it blindly (defence-in-depth; PostgREST already escapes).
const EMPLOYEE_STATUSES = ['active', 'inactive', 'on_leave', 'terminated'] as const;
type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

const COMPENSATION_FIELDS = [
	'hourly_rate',
	'overtime_multiplier_50',
	'overtime_multiplier_100',
	'night_shift_multiplier',
	'weekend_multiplier',
	'currency_code',
	'effective_from',
	'effective_to',
	'incentive_eligibility',
] as const;

function hasAnyField(payload: Record<string, unknown>, fields: readonly string[]): boolean {
	return fields.some((field) => field in payload);
}

async function logHrComplianceAccess(
	supabase: typeof supabaseAdmin,
	params: {
		tableName: string;
		accessType: 'SELECT' | 'VIEW_SENSITIVE' | 'EXPORT' | 'DOWNLOAD';
		purpose: string;
		requestPath: string;
		requestMethod: string;
		metadata?: Record<string, unknown>;
	}
) {
	const { error } = await supabase.rpc('log_hr_compliance_access', {
		p_table_name: params.tableName,
		p_record_id: undefined,
		p_employee_id: undefined,
		p_access_type: params.accessType,
		p_purpose: params.purpose,
		p_request_path: params.requestPath,
		p_request_method: params.requestMethod,
		p_metadata: (params.metadata ?? {}) as unknown as Json,
	});

	if (error) {
		console.warn('HR compliance access logging failed:', error.message);
	}
}

/**
 * GET /api/employees
 * List all employees in a department
 * 
 * Query params:
 * - department: Filter by department
 * - status: Filter by status (default: 'active')
 * - limit: Number of results (default: 50)
 * - offset: Pagination offset (default: 0)
 */
export async function GET(request: NextRequest) {
	try {
		const auth = await requireAuth();
		if (isAuthError(auth)) return auth;

		const canAccessCompensation = hasRole(auth.role, ['admin', 'hr_manager']);
		const supabase = supabaseAdmin;

		// Get query parameters
		const { searchParams } = new URL(request.url);
		const department = searchParams.get('department');
		const statusParam = searchParams.get('status') || 'active';
		const status: EmployeeStatus = (EMPLOYEE_STATUSES as readonly string[]).includes(statusParam)
			? (statusParam as EmployeeStatus)
			: 'active';
		const limit = parseInt(searchParams.get('limit') || '50', 10);
		const offset = parseInt(searchParams.get('offset') || '0', 10);

		// Build query
		let query = supabase
			.from('employees')
			.select(
				canAccessCompensation
					? `
				id,
				full_name,
				employee_code,
				department,
				status,
				hire_date,
				worker_legacy_id,
				employment_contracts(
					id,
					contract_type,
					hours_per_week:base_hours_per_week,
					overtime_allowed,
					start_date,
					end_date
				),
				compensation_rates(
					id,
					hourly_rate,
					overtime_multiplier_50,
					currency_code,
					effective_from,
					effective_to
				)
			`
					: `
				id,
				full_name,
				employee_code,
				department,
				status,
				hire_date,
				worker_legacy_id,
				employment_contracts(
					id,
					contract_type,
					hours_per_week:base_hours_per_week,
					overtime_allowed,
					start_date,
					end_date
				)
			`,
				{ count: 'exact' }
			)
			.eq('status', status)
			.order('full_name', { ascending: true })
			.range(offset, offset + limit - 1);

		// Apply department filter if provided
		if (department) {
			query = query.eq('department', department);
		}

		const { data, error, count } = await query;

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		await logHrComplianceAccess(supabase, {
			tableName: 'employees',
			accessType: canAccessCompensation ? 'VIEW_SENSITIVE' : 'SELECT',
			purpose: canAccessCompensation
				? 'Employee list with compensation context'
				: 'Employee list without compensation fields',
			requestPath: '/api/employees',
			requestMethod: 'GET',
			metadata: {
				department,
				status,
				limit,
				offset,
				result_count: Array.isArray(data) ? data.length : 0,
			},
		});

		return NextResponse.json({
			success: true,
			data,
			pagination: {
				total: count,
				limit,
				offset,
				hasMore: count ? offset + limit < count : false,
			},
		});
	} catch (error) {
		console.error('GET /api/employees error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

/**
 * POST /api/employees
 * Create a new employee
 * 
 * Body:
 * {
 *   full_name: string (required)
 *   department: string (required)
 *   hire_date: string (required, ISO date)
 *   employee_code?: string
 *   contract_type?: 'permanent' | 'temporary' | 'contract'
 *   hours_per_week?: number
 *   overtime_allowed?: boolean
 *   hourly_rate?: number
 *   overtime_multiplier_50?: number
 *   currency_code?: string
 * }
 */
export async function POST(request: NextRequest) {
	try {
		const auth = await requireAuth(['supervisor', 'admin', 'hr_manager']);
		if (isAuthError(auth)) return auth;

		const canManageSensitive = hasRole(auth.role, ['admin', 'hr_manager']);
		const supabase = supabaseAdmin;

		const body = await request.json();

		if (hasAnyField(body, COMPENSATION_FIELDS) && !canManageSensitive) {
			return NextResponse.json(
				{ error: 'Forbidden — compensation fields require admin or hr_manager' },
				{ status: 403 }
			);
		}

		if (hasAnyField(body, PERSONAL_EMPLOYEE_FIELDS) && !canManageSensitive) {
			return NextResponse.json(
				{ error: 'Forbidden — personal employee fields require admin or hr_manager' },
				{ status: 403 }
			);
		}

		// Validate required fields
		const { full_name, department, hire_date, employee_code } = body;

		if (!full_name || !department || !hire_date) {
			return NextResponse.json(
				{ error: 'Missing required fields: full_name, department, hire_date' },
				{ status: 400 }
			);
		}

		// Create employee
		const { data: employee, error: employeeError } = await supabase
			.from('employees')
			.insert([
				{
					full_name,
					department,
					hire_date,
					employee_code: employee_code || `EMP-${Date.now()}`,
					...(canManageSensitive
						? {
							email: body.email,
							phone: body.phone,
							emergency_contact_name: body.emergency_contact_name,
							emergency_contact_phone: body.emergency_contact_phone,
							notes: body.notes,
							termination_date: body.termination_date,
						}
						: {}),
					status: 'active',
				},
			])
			.select()
			.single();

		if (employeeError) {
			return NextResponse.json({ error: employeeError.message }, { status: 500 });
		}

		// Create default employment contract if provided.
		// The column is `base_hours_per_week` — this used to insert `hours_per_week`,
		// so every contract insert failed and the error was swallowed below, quietly
		// producing employees with no contract while still returning 201 (2026-07 audit).
		const warnings: string[] = [];

		if (body.contract_type && body.hours_per_week) {
			const { error: contractError } = await supabase
				.from('employment_contracts')
				.insert([
					{
						employee_id: employee.id,
						contract_type: body.contract_type,
						base_hours_per_week: body.hours_per_week,
						overtime_allowed: body.overtime_allowed || false,
						start_date: hire_date,
					},
				]);

			if (contractError) {
				console.error('Error creating contract:', contractError);
				warnings.push(`No se pudo crear el contrato: ${contractError.message}`);
			}
		}

		// Create default compensation rate if provided
		if (body.hourly_rate && canManageSensitive) {
			const { error: compensationError } = await supabase
				.from('compensation_rates')
				.insert([
					{
						employee_id: employee.id,
						hourly_rate: body.hourly_rate,
						overtime_multiplier_50: body.overtime_multiplier_50 || 1.5,
						overtime_multiplier_100: body.overtime_multiplier_100 || 2.0,
						night_shift_multiplier: body.night_shift_multiplier || 1.0,
						weekend_multiplier: body.weekend_multiplier || 1.0,
						currency_code: body.currency_code || 'USD',
						incentive_eligibility: body.incentive_eligibility ?? true,
						effective_from: hire_date,
						effective_to: body.effective_to || null,
					},
				]);

			if (compensationError) {
				console.error('Error creating compensation:', compensationError);
				warnings.push(`No se pudo crear la tarifa: ${compensationError.message}`);
			}
		}

		// Surface partial failures instead of swallowing them: the caller asked for a
		// person WITH a contract and a rate, and must be told if only part landed.
		return NextResponse.json(
			{ success: true, data: employee, ...(warnings.length ? { warnings } : {}) },
			{ status: 201 }
		);
	} catch (error) {
		console.error('POST /api/employees error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
