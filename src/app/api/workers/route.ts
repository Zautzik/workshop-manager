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
		const { data, error } = await supabaseAdmin
			.from('employees')
			.select('*')
			.order('full_name', { ascending: true });

		if (error) {
			console.error('Error fetching workers:', error);
			return NextResponse.json({ error: 'Failed to fetch workers' }, { status: 500 });
		}

		const mapped = (data ?? [])
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
	} catch (error) {
		console.error('Error fetching workers:', error);
		return NextResponse.json({ error: 'Failed to fetch workers' }, { status: 500 });
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
