/**
 * Individual Employee API Route
 * 
 * Endpoints:
 * - GET /api/employees/:id - Get employee by ID
 * - PUT /api/employees/:id - Update employee
 * - DELETE /api/employees/:id - Archive employee
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

/**
 * GET /api/employees/:id
 * Get employee by ID with related data
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: { id: string } }
) {
	try {
		const cookieStore = await cookies();
		const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

		const { data: employee, error } = await supabase
			.from('employees')
			.select(
				`
				*,
				employment_contracts(*),
				compensation_rates(*),
				employee_skills(*),
				leave_balances(*),
				leave_requests(*)
			`
			)
			.eq('id', params.id)
			.single();

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		if (!employee) {
			return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
		}

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
	{ params }: { params: { id: string } }
) {
	try {
		const cookieStore = await cookies();
		const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

		const body = await request.json();

		// Remove id from body if present
		const { id: _id, ...updates } = body;

		const { data: employee, error } = await supabase
			.from('employees')
			.update(updates)
			.eq('id', params.id)
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
	{ params }: { params: { id: string } }
) {
	try {
		const cookieStore = await cookies();
		const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

		const { data: employee, error } = await supabase
			.from('employees')
			.update({ status: 'archived' })
			.eq('id', params.id)
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
