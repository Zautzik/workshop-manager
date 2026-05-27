import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { MACHINE_STATUS_VALUES } from '@/types/machine-status';
import { MACHINE_TYPE_VALUES } from '@/types/machine-type';

const nullableString = z.string().max(5000).nullable().optional();
const nullableNumber = z.number().nullable().optional();

const UpdateMachineSchema = z.object({
	name: z.string().min(1).max(255).optional(),
	type: z.enum(MACHINE_TYPE_VALUES).optional(),
	status: z.enum(MACHINE_STATUS_VALUES).optional(),
	brand: nullableString,
	model: nullableString,
	serial_number: nullableString,
	year_manufactured: nullableNumber,
	location: nullableString,
	description: nullableString,
	photo_url: nullableString,
	nominal_speed_sheets_hr: nullableNumber,
	optimal_speed_sheets_hr: nullableNumber,
	max_print_width_mm: nullableNumber,
	max_print_height_mm: nullableNumber,
	colors: nullableNumber,
	power_kw: nullableNumber,
	energy_cost_per_hr: nullableNumber,
	maintenance_cost_monthly: nullableNumber,
	depreciation_monthly: nullableNumber,
	is_active: z.boolean().optional(),
	workstation_id: z.string().uuid().nullable().optional(),
});

const IdParamSchema = z.string().uuid();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { id } = await params;
	if (!IdParamSchema.safeParse(id).success) {
		return NextResponse.json({ error: 'Invalid machine ID' }, { status: 400 });
	}

	try {
		const { data, error } = await supabaseAdmin
			.from('machines')
			.select('*')
			.eq('id', id)
			.single();

		if (error) {
			console.error('Error fetching machine:', error);
			return NextResponse.json({ error: 'Failed to fetch machine' }, { status: 500 });
		}

		if (!data) {
			return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
		}

		return NextResponse.json(data);
	} catch (error) {
		console.error('Error fetching machine:', error);
		return NextResponse.json({ error: 'Failed to fetch machine' }, { status: 500 });
	}
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	const { id } = await params;
	if (!IdParamSchema.safeParse(id).success) {
		return NextResponse.json({ error: 'Invalid machine ID' }, { status: 400 });
	}

	try {
		const body = await req.json();
		const parsed = UpdateMachineSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const { data, error } = await supabaseAdmin
			.from('machines')
			.update({ ...parsed.data, updated_at: new Date().toISOString() } as any)
			.eq('id', id)
			.select('*')
			.single();

		if (error) {
			if (error.code === 'PGRST116') return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
			console.error('Error updating machine:', error);
			return NextResponse.json({ error: 'Failed to update machine' }, { status: 500 });
		}
		if (!data) return NextResponse.json({ error: 'Machine not found' }, { status: 404 });

		revalidateTag('machines', 'max');
		return NextResponse.json(data);
	} catch (error) {
		console.error('Error updating machine:', error);
		return NextResponse.json({ error: 'Failed to update machine' }, { status: 500 });
	}
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	const { id } = await params;
	if (!IdParamSchema.safeParse(id).success) {
		return NextResponse.json({ error: 'Invalid machine ID' }, { status: 400 });
	}

	try {
		const { error } = await supabaseAdmin
			.from('machines')
			.delete()
			.eq('id', id);

		if (error) {
			console.error('Error deleting machine:', error);
			return NextResponse.json({ error: 'Failed to delete machine' }, { status: 500 });
		}

		revalidateTag('machines', 'max');
		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Error deleting machine:', error);
		return NextResponse.json({ error: 'Failed to delete machine' }, { status: 500 });
	}
}
