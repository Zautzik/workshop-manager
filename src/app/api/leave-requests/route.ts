import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

const LeaveRequestSchema = z
  .object({
    employee_id: z.string().uuid(),
    leave_type: z.enum(['vacation', 'sick', 'personal', 'maternity', 'paternity', 'unpaid', 'other']),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD'),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD'),
    hours_requested: z.coerce.number().min(0).default(0),
    reason: z.string().max(2000).nullable().optional(),
  })
  .refine((r) => r.end_date >= r.start_date, {
    message: 'La fecha de término no puede ser anterior a la de inicio',
    path: ['end_date'],
  });

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const userId = typeof auth === 'object' && 'id' in auth ? auth.id : null;

  try {
    const parsed = LeaveRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Solicitud inválida', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('leave_requests')
      .insert({
        ...parsed.data,
        // Status and requester are the server's to decide, never the client's.
        status: 'pending',
        requested_by: userId,
      })
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudo crear la solicitud' }, { status: 500 });
  }
}
