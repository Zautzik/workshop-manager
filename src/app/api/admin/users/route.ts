import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, checkPassword } from '@/lib/password-policy';
import type { AppRole } from '@/types/app-role';

const CreateUserSchema = z.object({
	email: z.string().email().max(255),
	password: z
		.string()
		.min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
		.max(MAX_PASSWORD_LENGTH)
		.refine((p) => checkPassword(p).ok, (p) => ({ message: checkPassword(p).reason ?? 'Invalid password.' })),
	name: z.string().min(1).max(255).optional(),
	role: z.enum(['supervisor', 'manager', 'hr_manager', 'admin', 'technician']),
	department: z.string().max(100).optional().nullable(),
	manager_domain: z.string().max(100).optional().nullable(),
});

/**
 * GET /api/admin/users — list all users with their roles
 */
export async function GET(request: NextRequest) {
	const auth = await requireAuth('admin');
	if (isAuthError(auth)) return auth;

	try {
		const url = new URL(request.url);
		const page = parseInt(url.searchParams.get('page') || '1');
		const perPage = parseInt(url.searchParams.get('per_page') || '50');

		// Users live in Supabase Auth (auth.users), not a public profile table.
		// listUsers returns paginated results; offset is page-based.
		const { data: authList, error } = await supabaseAdmin.auth.admin.listUsers({
			page,
			perPage,
		});

		if (error) {
			console.error('Error fetching users:', error);
			return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
		}

		const authUsers = authList?.users ?? [];

		// Fetch roles for all returned users
		const userIds = authUsers.map((u) => u.id);
		const { data: roles } = await supabaseAdmin
			.from('user_roles')
			.select('*')
			.in('user_id', userIds.length > 0 ? userIds : ['__none__']);

		const usersWithRoles = authUsers.map((u) => {
			const userRole = (roles ?? []).find((r) => r.user_id === u.id);
			return {
				id: u.id,
				email: u.email,
				name: (u.user_metadata?.name as string | undefined) ?? null,
				created_at: u.created_at,
				role: userRole?.role ?? null,
				role_id: userRole?.id ?? null,
				department: userRole?.department ?? null,
				manager_domain: userRole?.manager_domain ?? null,
			};
		});

		return NextResponse.json({ users: usersWithRoles });
	} catch (error) {
		console.error('API error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

/**
 * POST /api/admin/users — create a new user via Supabase Auth
 */
export async function POST(request: NextRequest) {
	const auth = await requireAuth('admin');
	if (isAuthError(auth)) return auth;

	try {
		const body = await request.json();
		const parsed = CreateUserSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		// Create the user in Supabase Auth — the canonical identity store that
		// signInWithPassword authenticates against. email_confirm skips the
		// verification email for admin-provisioned accounts.
		const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
			email: parsed.data.email,
			password: parsed.data.password,
			email_confirm: true,
			user_metadata: {
				name: parsed.data.name || parsed.data.email.split('@')[0],
			},
		});

		if (authError) {
			const msg = authError.message.toLowerCase();
			if (msg.includes('already registered') || msg.includes('already exists')) {
				return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
			}
			console.error('Error creating auth user:', authError);
			return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
		}

		const authUser = authData.user;

		// Name is stored in user_metadata during createUser above — no separate
		// profile table exists in this schema.
		// Assign role
		const { error: roleError } = await supabaseAdmin
			.from('user_roles')
			.insert({
				user_id: authUser.id,
				role: parsed.data.role as AppRole,
				department: parsed.data.department || null,
				manager_domain: parsed.data.manager_domain || null,
			});

		if (roleError) {
			console.error('Error creating user role:', roleError);
			// Roll back the auth record to avoid an orphaned identity
			await supabaseAdmin.auth.admin.deleteUser(authUser.id);
			return NextResponse.json({ error: 'Failed to assign role' }, { status: 500 });
		}

		return NextResponse.json(
			{
				user: {
					id: authUser.id,
					email: authUser.email,
					name: (authUser.user_metadata?.name as string | undefined) ?? null,
				},
				role: parsed.data.role,
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error('API error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

/**
 * DELETE /api/admin/users?id=<user_id> — delete a user and their roles
 */
export async function DELETE(request: NextRequest) {
	const auth = await requireAuth('admin');
	if (isAuthError(auth)) return auth;

	try {
		const { searchParams } = new URL(request.url);
		const userId = searchParams.get('id');

		if (!userId || !z.string().uuid().safeParse(userId).success) {
			return NextResponse.json({ error: 'Valid user ID required' }, { status: 400 });
		}

		// Don't allow admins to delete themselves
		if (userId === auth.id) {
			return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
		}

		// Delete role first (FK constraint), then the auth identity
		await supabaseAdmin.from('user_roles').delete().eq('user_id', userId);

		// Remove the Supabase Auth record so the user can no longer sign in
		const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

		if (error) {
			console.error('Error deleting user:', error);
			return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('API error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

const UpdateUserSchema = z.object({
	id: z.string().uuid(),
	role: z.enum(['supervisor', 'manager', 'hr_manager', 'admin', 'technician']).optional(),
	department: z.string().max(100).optional().nullable(),
	manager_domain: z.string().max(100).optional().nullable(),
});

/**
 * PATCH /api/admin/users — update a user's role/department/manager_domain
 */
export async function PATCH(request: NextRequest) {
	const auth = await requireAuth('admin');
	if (isAuthError(auth)) return auth;

	try {
		const body = await request.json();
		const parsed = UpdateUserSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{ error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const { id, role, department, manager_domain } = parsed.data;

		// Build the update payload with only provided fields
		const updatePayload: Record<string, unknown> = {};
		if (role !== undefined) updatePayload.role = role;
		if (department !== undefined) updatePayload.department = department;
		if (manager_domain !== undefined) updatePayload.manager_domain = manager_domain;

		if (Object.keys(updatePayload).length === 0) {
			return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
		}

		const { error } = await supabaseAdmin
			.from('user_roles')
			.update(updatePayload)
			.eq('id', id);

		if (error) {
			console.error('Error updating user role:', error);
			return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('API error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
