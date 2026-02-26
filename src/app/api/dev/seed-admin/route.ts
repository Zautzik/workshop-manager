/**
 * @fileoverview Development-only endpoint to seed admin user
 * 
 * WARNING: This endpoint is only active in development mode
 * Do not deploy to production
 */

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST() {
  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'This endpoint is only available in development mode' },
      { status: 403 }
    );
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Supabase configuration missing' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Create admin user via admin API
    const { data: user, error: createError } = await supabase.auth.admin.createUser({
      email: 'admin@printpress.com',
      password: 'pass',
      email_confirm: true,
    });

    if (createError) {
      // Check if user already exists
      if (createError.message.includes('already registered')) {
        console.log('Admin user already exists');
      } else {
        throw createError;
      }
    }

    // Get the user ID (either newly created or existing)
    const { data: existingUser } = await supabase.auth.admin.listUsers();
    const adminUser = existingUser?.users?.find(u => u.email === 'admin@printpress.com');

    if (!adminUser) {
      return NextResponse.json(
        { error: 'Failed to find or create admin user' },
        { status: 500 }
      );
    }

    // Assign admin role
    const { error: roleError } = await supabase
      .from('user_roles')
      .upsert({
        user_id: adminUser.id,
        role: 'admin',
      });

    if (roleError) {
      console.error('Role assignment error:', roleError);
      // Continue anyway, role might already exist
    }

    return NextResponse.json({
      success: true,
      message: 'Admin user created successfully',
      credentials: {
        email: 'admin@printpress.com',
        password: 'pass',
      },
      nextSteps: 'Go to http://localhost:3000 and login with the credentials above',
    });
  } catch (error: any) {
    console.error('Seed admin error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
