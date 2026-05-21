import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import type { AppRole } from '@/types/app-role';

const CreateUserSchema = z.object({
	email: z.string().email().max(255),
	password: z.string().min(6).max(128),
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

		// Fetch users from the users table + roles
		const { data: users, error } = await supabaseAdmin
			.from('users' as any)
			.select('id, email, name, created_at')
			.order('created_at', { ascending: false })
			.range((page - 1) * perPage, page * perPage - 1);

		if (error) {
			console.error('Error fetching users:', error);
			return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
		}

		// Fetch roles for all users
		const userIds = ((users || []) as any[]).map((u) => u.id);
		const { data: roles } = await supabaseAdmin
			.from('user_roles')
			.select('*')
			.in('user_id', userIds.length > 0 ? userIds : ['__none__']);

		const usersWithRoles = (users || []).map((user: any) => {
			const userRole = (roles || []).find((r: { user_id: string }) => r.user_id === user.id) as any;
			return { ...user, role: userRole?.role ?? null, role_id: userRole?.id ?? null, department: userRole?.department ?? null, manager_domain: userRole?.manager_domain ?? null };
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

		// Sync a profile row so the rest of the app can join on users.id
		const { data: newUser, error: profileError } = await supabaseAdmin
			.from('users' as any)
			.insert({
				id: authUser.id,
				email: authUser.email,
				name: parsed.data.name || parsed.data.email.split('@')[0],
			})
			.select('id, email, name')
			.single();

		if (profileError) {
			console.error('Error creating user profile:', profileError);
			// Roll back the auth record to avoid an orphaned identity
			await supabaseAdmin.auth.admin.deleteUser(authUser.id);
			return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 });
		}

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
			// Roll back profile and auth record
			await supabaseAdmin.from('users' as any).delete().eq('id', authUser.id);
			await supabaseAdmin.auth.admin.deleteUser(authUser.id);
			return NextResponse.json({ error: 'Failed to assign role' }, { status: 500 });
		}

		return NextResponse.json(
			{ user: newUser, role: parsed.data.role },
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

		// Delete role first (FK constraint), then profile row, then the auth identity
		await supabaseAdmin.from('user_roles').delete().eq('user_id', userId);
		const { error } = await supabaseAdmin.from('users' as any).delete().eq('id', userId);

		if (error) {
			console.error('Error deleting user:', error);
			return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
		}

		// Remove the Supabase Auth record so the user can no longer sign in
		await supabaseAdmin.auth.admin.deleteUser(userId);

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
