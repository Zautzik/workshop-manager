import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  department: z.string().max(100).optional().nullable(),
  role: z.enum(['admin', 'supervisor', 'manager', 'hr_manager', 'technician']).optional().nullable(),
  permissions: z.record(z.boolean()).default({}),
  is_active: z.boolean().optional(),
});

const UpdateTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  department: z.string().max(100).nullable().optional(),
  role: z.enum(['admin', 'supervisor', 'manager', 'hr_manager', 'technician']).nullable().optional(),
  permissions: z.record(z.boolean()).optional(),
  is_active: z.boolean().optional(),
});

export async function GET(_req: NextRequest) {
  const auth = await requireAuth(['admin', 'hr_manager', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const db = supabaseAdmin as any;
    const { data, error } = await db
      .from('permission_templates')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching permission templates:', error);
      return NextResponse.json({ error: 'Failed to fetch permission templates' }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('Error in permission templates GET:', error);
    return NextResponse.json({ error: 'Failed to fetch permission templates' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'hr_manager']);
  if (isAuthError(auth)) return auth;

  try {
    const parsed = CreateTemplateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const db = supabaseAdmin as any;
    const { data, error } = await db
      .from('permission_templates')
      .insert([
        {
          ...parsed.data,
          created_by: auth.id,
        },
      ])
      .select('*')
      .single();

    if (error || !data) {
      console.error('Error creating permission template:', error);
      return NextResponse.json({ error: 'Failed to create permission template' }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in permission templates POST:', error);
    return NextResponse.json({ error: 'Failed to create permission template' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(['admin', 'hr_manager']);
  if (isAuthError(auth)) return auth;

  try {
    const parsed = UpdateTemplateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { id, ...updates } = parsed.data;
    const db = supabaseAdmin as any;
    const { data, error } = await db
      .from('permission_templates')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      console.error('Error updating permission template:', error);
      return NextResponse.json({ error: 'Failed to update permission template' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in permission templates PATCH:', error);
    return NextResponse.json({ error: 'Failed to update permission template' }, { status: 500 });
  }
}
