import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const ApprovalActionSchema = z.object({
	action: z.enum(['approve', 'reject', 'request_revision']),
	comments: z.string().max(2000).optional().nullable(),
});

// GET /api/ots/[id]/approval — get approval records for an OT
export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const { id } = await params;

	try {
		const { data, error } = await supabaseAdmin
			.from('ot_approvals')
			.select('*')
			.eq('ot_id', id)
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Error fetching approvals:', error);
			return NextResponse.json({ error: 'Failed to fetch approvals' }, { status: 500 });
		}

		return NextResponse.json(data ?? []);
	} catch (error) {
		console.error('Error fetching approvals:', error);
		return NextResponse.json({ error: 'Failed to fetch approvals' }, { status: 500 });
	}
}

// POST /api/ots/[id]/approval — request approval or resolve
export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const auth = await requireAuth(['supervisor', 'admin']);
	if (isAuthError(auth)) return auth;

	const { id } = await params;
	const userId = typeof auth === 'object' && 'id' in auth ? auth.id : null;

	try {
		const body = await req.json();
		const parsed = ApprovalActionSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const { action, comments } = parsed.data;

		if (action === 'approve' || action === 'reject' || action === 'request_revision') {
			const statusMap = {
				approve: 'approved',
				reject: 'rejected',
				request_revision: 'revision_requested',
			} as const;

			// Check if there's a pending approval (.maybeSingle so 0 rows → null, not an error)
			const { data: pending, error: pendingErr } = await supabaseAdmin
				.from('ot_approvals')
				.select('id')
				.eq('ot_id', id)
				.eq('status', 'pending')
				.limit(1)
				.maybeSingle();

			if (pendingErr) {
				console.error('Error checking pending approval:', pendingErr);
				return NextResponse.json({ error: 'Failed to check pending approval' }, { status: 500 });
			}

			if (pending) {
				// Update existing pending approval
				const { data, error } = await supabaseAdmin
					.from('ot_approvals')
					.update({
						status: statusMap[action],
						approver_id: userId,
						comments: comments || null,
						resolved_at: new Date().toISOString(),
					})
					.eq('id', pending.id)
					.select('*')
					.single();

				if (error) {
					console.error('Error resolving approval:', error);
					return NextResponse.json({ error: 'Failed to resolve approval' }, { status: 500 });
				}
				if (!data) return NextResponse.json({ error: 'Failed to resolve approval' }, { status: 500 });

				return NextResponse.json(data);
			}

			// Create new approval record with status
			const { data, error } = await supabaseAdmin
				.from('ot_approvals')
				.insert([{
					ot_id: id,
					requested_by: userId,
					approver_id: action !== 'approve' ? null : userId,
					status: statusMap[action],
					comments: comments || null,
					resolved_at: action !== 'approve' ? null : new Date().toISOString(),
				}])
				.select('*')
				.single();

			if (error) {
				console.error('Error creating approval:', error);
				return NextResponse.json({ error: 'Failed to create approval' }, { status: 500 });
			}

			return NextResponse.json(data, { status: 201 });
		}

		return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
	} catch (error) {
		console.error('Error processing approval:', error);
		return NextResponse.json({ error: 'Failed to process approval' }, { status: 500 });
	}
}
