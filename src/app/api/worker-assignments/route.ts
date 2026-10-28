import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { fetchAll } from '@/lib/fetch-all';
import { checkAssignment } from '@/lib/assignment-rules';

export const dynamic = 'force-dynamic';

// `workstation_id` sigue aceptándose porque es el vocabulario del piso —uno se
// para en un puesto— pero ese puesto ES la máquina desde la fusión, así que el
// valor se escribe en `machine_id`. Se acepta cualquiera de los dos nombres para
// que un cliente antiguo no se quede fuera a mitad del despliegue.
const AssignmentSchema = z
  .object({
    employee_id: z.string().uuid(),
    workstation_id: z.string().uuid().optional(),
    machine_id: z.string().uuid().optional(),
    shift_id: z.string().uuid(),
    date: z.string().min(1),
    role: z.string().min(1),
    ot_id: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.machine_id ?? v.workstation_id, {
    message: 'Falta la máquina: envía machine_id.',
    path: ['machine_id'],
  })
  .transform(({ workstation_id, ...rest }) => ({
    ...rest,
    machine_id: (rest.machine_id ?? workstation_id)!,
  }));

const AssignmentBulkSchema = z.array(AssignmentSchema).min(1);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Lo que Planta necesita de cada asignación: la máquina, el turno con su
// horario (horas semanales, horas extra, turnos archivados) y el nombre del
// operario. Del empleado sólo nombre y área: teléfono, contacto de emergencia y
// correo no tienen por qué viajar a cualquier rol con sesión.
const ASSIGNMENT_COLUMNS =
  'id, employee_id, machine_id, ot_id, role, date, shift_id, hours_worked, ' +
  'workstation:machines!machine_id(id, name, type), ' +
  'employee:employees(id, full_name, department), ' +
  'shift:shifts(id, name, code, start_time, end_time, archived_at)';

/**
 * GET /api/worker-assignments?date=YYYY-MM-DD
 *     /api/worker-assignments?from=YYYY-MM-DD&to=YYYY-MM-DD   → un rango (semana, mes)
 *     /api/worker-assignments?latest=1   → most recent roster on or before today
 *   Filtros opcionales: `shiftId`, `role` (contiene, sin mayúsculas: «overtime»).
 *
 * Planta leía `worker_assignments` directo desde el navegador, y desde la
 * migración 20260801160000 la tabla tiene RLS sin políticas: el navegador
 * recibía CERO filas, siempre. Se asignaba a alguien, la escritura (que ya iba
 * por esta ruta) funcionaba, y la persona desaparecía de la pantalla; las
 * horas semanales y extra que protegen la asignación también contaban cero
 * (encontrado con el escenario de prueba, 2026-10-28). Toda lectura pasa por acá.
 *
 * Returns { date, assignments } where each assignment carries its workstation
 * (name/type) and the OT number. `ot_id` holds an `ots.id` in practice (PlantaBoard
 * writes selectedOT.id); the typed FK still points at the legacy `rosters` table, so
 * resolve the OT number explicitly against `ots` instead of a PostgREST embed.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const today = new Date().toISOString().split('T')[0];
  const explicitDate = searchParams.get('date');
  const wantsLatest = searchParams.get('latest');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const shiftId = searchParams.get('shiftId');
  const roleLike = searchParams.get('role');

  if ([explicitDate, from, to].some((d) => d != null && !ISO_DATE.test(d))) {
    return NextResponse.json({ error: 'Fecha inválida: usa YYYY-MM-DD.' }, { status: 400 });
  }

  if (from || to) {
    if (!from || !to || from > to) {
      return NextResponse.json({ error: 'El rango necesita from ≤ to.' }, { status: 400 });
    }
    // Un mes de dotación pasa las 1000 filas por defecto de PostgREST: se pagina.
    const { rows, truncated } = await fetchAll<any>((desde, hasta) => {
      let q = supabaseAdmin.from('worker_assignments').select(ASSIGNMENT_COLUMNS).gte('date', from).lte('date', to);
      if (shiftId) q = q.eq('shift_id', shiftId);
      if (roleLike) q = q.ilike('role', `%${roleLike}%`);
      return q.order('date').range(desde, hasta) as any;
    });
    return NextResponse.json({ from, to, assignments: rows, truncated });
  }

  let date = explicitDate || today;

  // Fall back to the newest roster at or before today so the view is meaningful
  // even when today's roster hasn't been set yet.
  if (wantsLatest && !explicitDate) {
    const { data: latestRow } = await supabaseAdmin
      .from('worker_assignments')
      .select('date')
      .lte('date', today)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestRow?.date) date = latestRow.date;
  }

  // `workstation` se sigue devolviendo con ese nombre para no romper a los
  // consumidores, pero ahora viene de `machines`: una sola identidad de equipo.
  let dayQuery = supabaseAdmin.from('worker_assignments').select(ASSIGNMENT_COLUMNS).eq('date', date);
  if (shiftId) dayQuery = dayQuery.eq('shift_id', shiftId);
  if (roleLike) dayQuery = dayQuery.ilike('role', `%${roleLike}%`);
  const { data: rows, error } = await dayQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const assignments = rows ?? [];
  const otIds = Array.from(
    new Set(assignments.map((a: any) => a.ot_id).filter(Boolean))
  ) as string[];

  let otMap = new Map<string, string>();
  if (otIds.length > 0) {
    const { data: ots } = await supabaseAdmin
      .from('ots')
      .select('id, ot_number')
      .in('id', otIds);
    otMap = new Map((ots ?? []).map((o: any) => [o.id, o.ot_number]));
  }

  return NextResponse.json({
    date,
    assignments: assignments.map((a: any) => ({
      ...a,
      // Alias: tras la fusión el puesto y la máquina son la misma cosa, y el
      // frontend todavía compara por `workstation_id` en varios sitios.
      workstation_id: a.machine_id,
      ot_number: a.ot_id ? otMap.get(a.ot_id) ?? null : null,
    })),
  });
}

/**
 * Un turno en una máquina de producción tiene que decir a qué OT se carga.
 *
 * La comprobación vive acá y no sólo en la pantalla porque la pantalla se puede
 * saltar: cualquiera con sesión de supervisor puede llamar a este endpoint. Y
 * porque la consecuencia no es cosmética — una asignación sin OT son horas que
 * no entran al costo de ningún trabajo, y un margen que sale más alto de lo que
 * fue sin que nadie lo note.
 *
 * La regla —qué tipos de máquina exigen OT y por qué el reparto no— vive en
 * `assignment-rules.ts`, con pruebas.
 */
async function rechazarSinOT(
  filas: { machine_id: string; ot_id?: string | null }[],
): Promise<NextResponse | null> {
  const ids = [...new Set(filas.map((f) => f.machine_id))];
  const { data: maquinas } = await supabaseAdmin
    .from('machines')
    .select('id, name, type')
    .in('id', ids);

  const tipoDe = new Map((maquinas ?? []).map((m: any) => [m.id, m.type]));
  const nombreDe = new Map((maquinas ?? []).map((m: any) => [m.id, m.name]));

  for (const f of filas) {
    const veredicto = checkAssignment({ machineType: tipoDe.get(f.machine_id), otId: f.ot_id });
    if (!veredicto.ok) {
      return NextResponse.json(
        {
          error: veredicto.reason,
          machine: nombreDe.get(f.machine_id) ?? null,
          field: 'ot_id',
        },
        { status: 400 },
      );
    }
  }
  return null;
}

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

      const rechazo = await rechazarSinOT(parsed.data);
      if (rechazo) return rechazo;

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

    const rechazo = await rechazarSinOT([parsed.data]);
    if (rechazo) return rechazo;

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
