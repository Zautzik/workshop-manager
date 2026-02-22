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
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

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
		const supabase = createRouteHandlerClient({ cookies: async () => cookies() });

		// Get query parameters
		const { searchParams } = new URL(request.url);
		const department = searchParams.get('department');
		const status = searchParams.get('status') || 'active';
		const limit = parseInt(searchParams.get('limit') || '50', 10);
		const offset = parseInt(searchParams.get('offset') || '0', 10);

		// Build query
		let query = supabase
			.from('employees')
			.select(
				`
				id,
				full_name,
				employee_number,
				department,
				status,
				hire_date,
				worker_legacy_id,
				employment_contracts(
					id,
					contract_type,
					hours_per_week,
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
 *   employee_number?: string
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
		const supabase = createRouteHandlerClient({ cookies: async () => cookies() });

		const body = await request.json();

		// Validate required fields
		const { full_name, department, hire_date, employee_number } = body;

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
					employee_number: employee_number || `EMP-${Date.now()}`,
					status: 'active',
				},
			])
			.select()
			.single();

		if (employeeError) {
			return NextResponse.json({ error: employeeError.message }, { status: 500 });
		}

		// Create default employment contract if provided
		if (body.contract_type && body.hours_per_week) {
			const { error: contractError } = await supabase
				.from('employment_contracts')
				.insert([
					{
						employee_id: employee.id,
						contract_type: body.contract_type,
						hours_per_week: body.hours_per_week,
						overtime_allowed: body.overtime_allowed || false,
						start_date: hire_date,
					},
				]);

			if (contractError) {
				console.error('Error creating contract:', contractError);
			}
		}

		// Create default compensation rate if provided
		if (body.hourly_rate) {
			const { error: compensationError } = await supabase
				.from('compensation_rates')
				.insert([
					{
						employee_id: employee.id,
						hourly_rate: body.hourly_rate,
						overtime_multiplier_50: body.overtime_multiplier_50 || 1.5,
						currency_code: body.currency_code || 'USD',
						effective_from: hire_date,
					},
				]);

			if (compensationError) {
				console.error('Error creating compensation:', compensationError);
			}
		}

		return NextResponse.json({ success: true, data: employee }, { status: 201 });
	} catch (error) {
		console.error('POST /api/employees error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
