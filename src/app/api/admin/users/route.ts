/**
 * @fileoverview Admin Users API Route
 * 
 * SYSTEM ROLE: Secure Gateway for Admin Operations
 * ORGAN ANALOGY: The "Guard at the Gate" - Validates credentials before allowing admin access
 * 
 * This route uses the SERVER-SIDE Supabase client with the ADMIN/SERVICE_ROLE key,
 * which has permission to call the admin API endpoints.
 * 
 * The client-side cannot directly call admin endpoints because:
 * - Client uses ANON key (limited permissions)
 * - Admin endpoints require SERVICE_ROLE key (secret, server-only)
 * 
 * This route acts as a secure intermediary that:
 * 1. Verifies the user is authenticated (has a valid session)
 * 2. Checks if user has admin role
 * 3. Safely calls the admin API with the service role key
 * 4. Returns the results to the client
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/integrations/supabase/server';

/**
 * GET /api/admin/users
 * 
 * Fetches all users from Supabase auth (Supabase Admin API)
 * Only accessible to authenticated users with 'admin' role
 * 
 * Security layers:
 * 1. Authentication check (user must be logged in)
 * 2. Authorization check (user must have admin role)
 * 3. Server-side execution (uses SERVICE_ROLE key safely)
 */
export async function GET(request: NextRequest) {
  try {
    // Step 1: Verify user is authenticated
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized - No session' },
        { status: 401 }
      );
    }

    // Step 2: Verify user has admin role
    if (session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden - Admin role required' },
        { status: 403 }
      );
    }

    // Step 3: Call Supabase admin API (using SERVICE_ROLE key on the server)
    // parseQueryString the pagination parameters from the URL
    const url = new URL(request.url);
    const page = url.searchParams.get('page') || '1';
    const perPage = url.searchParams.get('per_page') || '10';

    const { data, error } = await (supabaseAdmin.auth as any).admin.listUsers({
      page: parseInt(page),
      perPage: parseInt(perPage),
    });

    if (error) {
      console.error('Supabase admin error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch users' },
        { status: 500 }
      );
    }

    // Step 4: Return the users data
    return NextResponse.json({ users: data?.users || [] });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
