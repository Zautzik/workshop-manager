import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

const AssignmentSchema = z.object({
  employee_id: z.string().uuid(),
  workstation_id: z.string().uuid(),
  shift_id: z.string().uuid(),
  date: z.string().min(1),
  role: z.string().min(1),
  ot_id: z.string().uuid().nullable().optional(),
});

const AssignmentBulkSchema = z.array(AssignmentSchema).min(1);

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();

    if (Array.isArray(body)) {
      const parsed = AssignmentBulkSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
          { status: 400 }
        );
      }

      const { data, error } = await supabaseAdmin
        .from('worker_assignments')
        .insert(parsed.data)
        .select('*');

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(data ?? []);
    }

    const parsed = AssignmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('worker_assignments')
      .insert(parsed.data)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const shiftId = searchParams.get('shiftId');

  if (!date || !shiftId) {
    return NextResponse.json(
      { error: 'date and shiftId are required' },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from('worker_assignments')
    .delete()
    .eq('date', date)
    .eq('shift_id', shiftId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
