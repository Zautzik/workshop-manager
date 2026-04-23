import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const CreateConnectorSchema = z.object({
  provider: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  status: z.enum(['inactive', 'active', 'error']).optional(),
  config: z.record(z.any()).optional(),
});

const UpdateConnectorSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['inactive', 'active', 'error']).optional(),
  config: z.record(z.any()).optional(),
  last_error: z.string().max(2000).nullable().optional(),
  last_sync_at: z.string().datetime().nullable().optional(),
});

export async function GET(_req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;

  try {
    const db = supabaseAdmin as any;
    const { data, error } = await db
      .from('integration_connectors')
      .select('*')
      .order('provider', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching connectors:', error);
      return NextResponse.json({ error: 'Failed to fetch connectors' }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('Error in connectors GET:', error);
    return NextResponse.json({ error: 'Failed to fetch connectors' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin']);
  if (isAuthError(auth)) return auth;

  try {
    const parsed = CreateConnectorSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const db = supabaseAdmin as any;
    const { data, error } = await db
      .from('integration_connectors')
      .insert([
        {
          provider: parsed.data.provider,
          name: parsed.data.name,
          status: parsed.data.status ?? 'inactive',
          config: parsed.data.config ?? {},
          created_by: auth.id,
        },
      ])
      .select('*')
      .single();

    if (error || !data) {
      console.error('Error creating connector:', error);
      return NextResponse.json({ error: 'Failed to create connector' }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in connectors POST:', error);
    return NextResponse.json({ error: 'Failed to create connector' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(['admin']);
  if (isAuthError(auth)) return auth;

  try {
    const parsed = UpdateConnectorSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { id, ...fields } = parsed.data;
    const db = supabaseAdmin as any;

    const { data, error } = await db
      .from('integration_connectors')
      .update(fields)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      console.error('Error updating connector:', error);
      return NextResponse.json({ error: 'Failed to update connector' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in connectors PATCH:', error);
    return NextResponse.json({ error: 'Failed to update connector' }, { status: 500 });
  }
}
