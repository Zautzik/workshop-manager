/**
 * Individual Employee API Route
 * 
 * Endpoints:
 * - GET /api/employees/:id - Get employee by ID
 * - PUT /api/employees/:id - Update employee
 * - DELETE /api/employees/:id - Archive employee
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { hasRole, isAuthError, requireAuth } from '@/lib/api-middleware';

const PERSONAL_EMPLOYEE_FIELDS = [
	'email',
	'phone',
	'emergency_contact_name',
	'emergency_contact_phone',
	'notes',
	'termination_date',
	'user_id',
	'worker_legacy_id',
] as const;

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
		recordId: string;
		employeeId: string;
		accessType: 'SELECT' | 'VIEW_SENSITIVE' | 'EXPORT' | 'DOWNLOAD';
		purpose: string;
		requestPath: string;
		requestMethod: string;
		metadata?: Record<string, unknown>;
	}
) {
	const { error } = await supabase.rpc('log_hr_compliance_access', {
		p_table_name: params.tableName,
		p_record_id: params.recordId,
		p_employee_id: params.employeeId,
		p_access_type: params.accessType,
		p_purpose: params.purpose,
		p_request_path: params.requestPath,
		p_request_method: params.requestMethod,
		p_metadata: params.metadata ?? {},
	});

	if (error) {
		console.warn('HR compliance access logging failed:', error.message);
	}
}

/**
 * GET /api/employees/:id
 * Get employee by ID with related data
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const auth = await requireAuth();
		if (isAuthError(auth)) return auth;

		const canAccessSensitive = hasRole(auth.role, ['admin', 'hr_manager']);
		const { id } = await params;
		const supabase = supabaseAdmin;

		const { data: employee, error } = await supabase
			.from('employees')
			.select(
				canAccessSensitive
					? `
				id,
				full_name,
				employee_number,
				department,
				status,
				hire_date,
				termination_date,
				email,
				phone,
				emergency_contact_name,
				emergency_contact_phone,
				notes,
				worker_legacy_id,
				employment_contracts(*),
				compensation_rates(*),
				employee_skills(*),
				leave_balances(*),
				leave_requests(*)
			`
					: `
				id,
				full_name,
				employee_number,
				department,
				status,
				hire_date,
				worker_legacy_id,
				employment_contracts(id, contract_type, start_date, end_date, overtime_allowed),
				employee_skills(*),
				leave_balances(leave_type, balance_hours, accrued_hours, used_hours, as_of),
				leave_requests(id, leave_type, status, start_date, end_date, hours_requested, approved_at)
			`
			)
			.eq('id', id)
			.single();

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		if (!employee) {
			return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
		}

		await logHrComplianceAccess(supabase, {
			tableName: 'employees',
			recordId: id,
			employeeId: id,
			accessType: canAccessSensitive ? 'VIEW_SENSITIVE' : 'SELECT',
			purpose: canAccessSensitive
				? 'Employee profile with sensitive HR fields'
				: 'Employee profile without sensitive HR fields',
			requestPath: `/api/employees/${id}`,
			requestMethod: 'GET',
			metadata: {
				includes_compensation: canAccessSensitive,
				includes_personal_fields: canAccessSensitive,
			},
		});

		return NextResponse.json({ success: true, data: employee });
	} catch (error) {
		console.error('GET /api/employees/:id error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

/**
 * PUT /api/employees/:id
 * Update employee information
 * 
 * Body: Partial employee object with fields to update
 */
export async function PUT(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const auth = await requireAuth(['supervisor', 'admin', 'hr_manager']);
		if (isAuthError(auth)) return auth;

		const canManageSensitive = hasRole(auth.role, ['admin', 'hr_manager']);
		const { id } = await params;
		const supabase = supabaseAdmin;

		const body = await request.json();

		// Remove id from body if present
		const { id: _id, ...updates } = body;

		if (hasAnyField(updates, COMPENSATION_FIELDS)) {
			return NextResponse.json(
				{
					error:
						'Compensation fields must be updated via compensation endpoints and require admin or hr_manager',
				},
				{ status: 400 }
			);
		}

		if (hasAnyField(updates, PERSONAL_EMPLOYEE_FIELDS) && !canManageSensitive) {
			return NextResponse.json(
				{ error: 'Forbidden — personal employee fields require admin or hr_manager' },
				{ status: 403 }
			);
		}

		const { data: employee, error } = await supabase
			.from('employees')
			.update(updates)
			.eq('id', id)
			.select()
			.single();

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ success: true, data: employee });
	} catch (error) {
		console.error('PUT /api/employees/:id error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

/**
 * DELETE /api/employees/:id
 * Archive employee (soft delete)
 */
export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const auth = await requireAuth(['supervisor', 'admin', 'hr_manager']);
		if (isAuthError(auth)) return auth;

		const { id } = await params;
		const supabase = supabaseAdmin;

		const { data: employee, error } = await supabase
			.from('employees')
			.update({ status: 'archived' })
			.eq('id', id)
			.select()
			.single();

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ success: true, data: employee, message: 'Employee archived' });
	} catch (error) {
		console.error('DELETE /api/employees/:id error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
