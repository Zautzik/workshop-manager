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

const ListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  employee_id: z.string().uuid().optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
});

/**
 * Lista las licencias y permisos, con la persona y su área.
 *
 * Esta ruta era sólo POST, y por eso la pestaña «Asistencia» de
 * `/personas/consola` leía `leave_requests` directo desde el navegador con la
 * publishable key. La policy de lectura cuelga de
 * `can_supervisor_view_employee(auth.uid(), …)` y acá `auth.uid()` es siempre
 * NULL (se entra por NextAuth, nunca hay JWT de Supabase), así que devolvía
 * cero filas como `200 []` y la pestaña decía «no hay licencias» sin que nada
 * fallara. Ver el encabezado de `/api/hr/contracts`.
 *
 * Mismo portón que el POST: las licencias las administran RRHH y los
 * supervisores, no cualquiera con sesión.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(['admin', 'hr_manager', 'supervisor']);
  if (isAuthError(auth)) return auth;

  const parsed = ListSchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Parámetros inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const { page, limit, employee_id, status } = parsed.data;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('leave_requests')
    .select('*, employees(full_name, department)', { count: 'exact' })
    .order('start_date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (employee_id) query = query.eq('employee_id', employee_id);
  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'hr_manager', 'supervisor']);
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
