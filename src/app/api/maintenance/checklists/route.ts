import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin as supabase } from '@/integrations/supabase/server';

const ChecklistItemSchema = z.object({
	id: z.string().optional(),
	title: z.string().min(1),
	description: z.string().optional(),
	estimatedTime: z.number().min(0).optional(),
	priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
	tools: z.array(z.string()).optional(),
});

const CreateChecklistSchema = z.object({
	name: z.string().min(1).max(255),
	machineType: z.string().min(1).max(100),
	maintenanceType: z.enum(['preventive', 'corrective', 'emergency', 'inspection', 'cleaning']).optional(),
	items: z.array(ChecklistItemSchema).optional(),
	totalEstimatedTime: z.number().min(0).optional(),
	frequency: z.string().max(50).optional(),
});

const UpdateChecklistSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(255).optional(),
	machineType: z.string().min(1).max(100).optional(),
	maintenanceType: z.enum(['preventive', 'corrective', 'emergency', 'inspection', 'cleaning']).optional(),
	items: z.array(ChecklistItemSchema).optional(),
	totalEstimatedTime: z.number().min(0).optional(),
});

export async function GET(_request: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const { data, error } = await supabase
			.from('maintenance_checklists')
			.select('*')
			.order('created_at', { ascending: false });

		if (error) throw error;
		return NextResponse.json(data);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		console.error('Error fetching checklists:', message);
		return NextResponse.json({ error: 'Failed to fetch checklists' }, { status: 500 });
	}
}

export async function POST(request: NextRequest) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	try {
		const body = await request.json();
		const parsed = CreateChecklistSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const { data, error } = await supabase
			.from('maintenance_checklists')
			.insert([
				{
					name: parsed.data.name,
					machine_type: parsed.data.machineType,
					maintenance_type: parsed.data.maintenanceType || 'preventive',
					items: (parsed.data.items || []) as unknown as Record<string, unknown>,
					total_estimated_time: parsed.data.totalEstimatedTime || 0,
					frequency: parsed.data.frequency || 'as_needed',
				} as any,
			])
			.select();

		if (error) throw error;
		return NextResponse.json(data[0], { status: 201 });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		console.error('Error creating checklist:', message);
		return NextResponse.json({ error: 'Failed to create checklist' }, { status: 500 });
	}
}

export async function PATCH(request: NextRequest) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	try {
		const body = await request.json();
		const parsed = UpdateChecklistSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const { id, ...updateData } = parsed.data;

		const { data, error } = await supabase
			.from('maintenance_checklists')
			.update({
				...(updateData.name && { name: updateData.name }),
				...(updateData.machineType && { machine_type: updateData.machineType }),
				...(updateData.maintenanceType && { maintenance_type: updateData.maintenanceType }),
				...(updateData.items && { items: updateData.items as unknown as Record<string, unknown> }),
				...(updateData.totalEstimatedTime !== undefined && {
					total_estimated_time: updateData.totalEstimatedTime,
				}),
				updated_at: new Date().toISOString(),
			} as any)
			.eq('id', id)
			.select();

		if (error) throw error;
		return NextResponse.json(data[0]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		console.error('Error updating checklist:', message);
		return NextResponse.json({ error: 'Failed to update checklist' }, { status: 500 });
	}
}

export async function DELETE(request: NextRequest) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	try {
		const { searchParams } = new URL(request.url);
		const id = searchParams.get('id');

		if (!id || !z.string().uuid().safeParse(id).success) {
			return NextResponse.json({ error: 'Valid checklist ID required' }, { status: 400 });
		}

		const { error } = await supabase
			.from('maintenance_checklists')
			.delete()
			.eq('id', id);

		if (error) throw error;
		return NextResponse.json({ success: true });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		console.error('Error deleting checklist:', message);
		return NextResponse.json({ error: 'Failed to delete checklist' }, { status: 500 });
	}
}
