import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { effectiveLevel } from '@/lib/machine-competency';
import { checkAssignee, skillForSystem } from '@/lib/maintenance-competency-map';

export const dynamic = 'force-dynamic';

/**
 * A machine is out of service when its maintenance has actually STARTED.
 * Deliberately not 'pending': a work order scheduled for next Tuesday doesn't
 * stop you printing today, and treating it as a block would idle a third of the
 * plant on paper while the presses run fine.
 */
const BLOCKING_STATUSES = ['in_progress'];

/**
 * GET /api/maintenance/work-orders?open=1
 *
 * Answers the question Planta needs: which machines are out of service right
 * now. In a real shop this is law — if the press is opened up, nobody assigns a
 * run to it — but the two modules lived back to back: Equipos never told Planta.
 *
 * `?open=1` returns only what genuinely blocks. Pass `?status=pending,in_progress`
 * to see scheduled work too.
 *
 * Tras fusionar `workstations` dentro de `machines`, el puesto y la máquina son
 * la misma identidad: `workstation_ids` y `by_workstation` se conservan como
 * alias de los campos por máquina para no romper a los consumidores.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const openOnly = searchParams.get('open') === '1';
  const statusParam = searchParams.get('status');
  const statuses = statusParam ? statusParam.split(',') : openOnly ? BLOCKING_STATUSES : null;

  let query = supabaseAdmin
    .from('maintenance_work_orders')
    .select('id, machine_id, status, scheduled_date, started_at, machines(name)')
    .order('scheduled_date', { ascending: true });

  if (statuses) query = query.in('status', statuses);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orders = data ?? [];
  const machineIds = [...new Set(orders.map((o) => o.machine_id).filter(Boolean))] as string[];

  // machine_id → why it's down, so the UI can say more than "unavailable".
  const byMachine: Record<string, { work_order_id: string; status: string; machine_name: string | null; started_at: string | null }> = {};
  for (const o of orders) {
    if (!o.machine_id || byMachine[o.machine_id]) continue;
    const machine = o.machines as { name?: string } | null;
    byMachine[o.machine_id] = {
      work_order_id: o.id,
      status: o.status,
      machine_name: machine?.name ?? null,
      started_at: o.started_at,
    };
  }

  return NextResponse.json({
    orders,
    machine_ids: machineIds,
    // Alias: el puesto ES la máquina desde la fusión.
    workstation_ids: machineIds,
    by_machine: byMachine,
    by_workstation: Object.fromEntries(
      Object.entries(byMachine).map(([id, v]) => [id, { ...v, workstation_name: v.machine_name }])
    ),
  });
}

/* ── Crear una orden ──────────────────────────────────────────────────────── */

const CreateSchema = z.object({
  machine_id: z.string().uuid(),
  work_order_type: z.enum(['preventivo', 'correctivo', 'mejora']).default('correctivo'),
  /** Obligatorio en preventivo: es la pauta que hay que seguir. */
  checklist_id: z.string().uuid().nullable().optional(),
  title: z.string().min(3).max(200).nullable().optional(),
  fault_description: z.string().max(4000).nullable().optional(),
  /** De qué pieza nació. Es el enlace con Mecánica. */
  part_id: z.string().uuid().nullable().optional(),
  system_id: z.string().uuid().nullable().optional(),
  scheduled_date: z.string().optional(),
  priority: z.coerce.number().int().min(1).max(5).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  /** El supervisor se hace cargo de asignar a alguien no habilitado. */
  acknowledge_unqualified: z.boolean().optional(),
});

/**
 * POST /api/maintenance/work-orders
 *
 * No existía. Había 39 órdenes en la base y ninguna se podía emitir desde la
 * app, así que una pieza marcada "vencida" en Mecánica no tenía a dónde ir: el
 * módulo detectaba el problema y ahí se terminaba.
 *
 * Al asignar se verifica que la persona esté habilitada en el sistema que hay
 * que intervenir. No bloquea por sí solo —en un taller real a veces se
 * interviene igual porque hay que producir— pero exige que un supervisor lo
 * confirme explícitamente en vez de que pase inadvertido.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const parsed = CreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos de la orden', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const body = parsed.data;

    if (body.work_order_type === 'preventivo' && !body.checklist_id) {
      return NextResponse.json(
        { error: 'Una orden preventiva necesita la pauta que hay que seguir.' },
        { status: 400 }
      );
    }
    if (body.work_order_type !== 'preventivo' && !body.title && !body.fault_description) {
      return NextResponse.json(
        { error: 'Una orden correctiva necesita decir qué pasó: título o descripción de la falla.' },
        { status: 400 }
      );
    }

    const { data: machine } = await supabaseAdmin
      .from('machines')
      .select('id, name, usage_counter')
      .eq('id', body.machine_id)
      .single();

    if (!machine) {
      return NextResponse.json({ error: 'Máquina no encontrada' }, { status: 404 });
    }

    // Si nace de una pieza, el sistema se deduce de ella.
    let systemId = body.system_id ?? null;
    if (body.part_id && !systemId) {
      const { data: part } = await supabaseAdmin
        .from('machine_parts')
        .select('system_id')
        .eq('id', body.part_id)
        .single();
      systemId = part?.system_id ?? null;
    }

    // ── ¿Está habilitado quien va a hacerlo? ──
    let assigneeCheck = null;
    if (body.assigned_to && systemId) {
      const [{ data: system }, { data: employee }] = await Promise.all([
        supabaseAdmin.from('machine_systems').select('code, name').eq('id', systemId).single(),
        supabaseAdmin.from('employees').select('id, full_name').eq('id', body.assigned_to).single(),
      ]);

      const skillCode = skillForSystem(system?.code);
      if (skillCode && employee) {
        const { data: skill } = await supabaseAdmin
          .from('skills').select('id').eq('code', skillCode).maybeSingle();

        const { data: held } = skill
          ? await supabaseAdmin
              .from('employee_skills')
              .select('proficiency_level, certified, certification_expires_on, last_assessed_on')
              .eq('employee_id', body.assigned_to)
              .eq('skill_id', skill.id)
              .maybeSingle()
          : { data: null };

        const hoy = new Date();
        // Nivel efectivo, no declarado: una competencia sin verificar se enfría.
        const nivel = held ? effectiveLevel(held, hoy).level : null;
        const vencida =
          !!held?.certification_expires_on && new Date(held.certification_expires_on) < hoy;

        assigneeCheck = checkAssignee({
          systemCode: system?.code,
          level: nivel,
          certified: held?.certified ?? false,
          certificationExpired: vencida,
          assigneeName: employee.full_name,
          systemName: system?.name,
        });

        if (assigneeCheck.requiresAcknowledgement && !body.acknowledge_unqualified) {
          return NextResponse.json(
            {
              error: 'Quien va a hacer el trabajo no está habilitado en ese sistema',
              assignee_check: assigneeCheck,
              hint: 'Asigna a alguien habilitado, o reenvía con acknowledge_unqualified para hacerte cargo de la excepción.',
            },
            { status: 409 }
          );
        }
      }
    }

    const { data, error } = await supabaseAdmin
      .from('maintenance_work_orders')
      .insert({
        machine_id: body.machine_id,
        work_order_type: body.work_order_type,
        checklist_id: body.checklist_id ?? null,
        title: body.title ?? null,
        fault_description: body.fault_description ?? null,
        part_id: body.part_id ?? null,
        system_id: systemId,
        scheduled_date: body.scheduled_date ?? new Date().toISOString().slice(0, 10),
        priority: body.priority ?? 2,
        assigned_to: body.assigned_to ?? null,
        notes: body.notes ?? null,
        status: 'pending',
        // A cuánto uso se emitió: comparado después con la vida útil estimada
        // de la pieza, dice si esa estimación era realista.
        usage_at_creation: machine.usage_counter ?? null,
      })
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(
      {
        ...data,
        // Se devuelve aunque haya pasado: el supervisor asumió una excepción y
        // eso tiene que quedar visible en la respuesta, no sólo en la base.
        assignee_check: assigneeCheck,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: 'No se pudo crear la orden de trabajo' }, { status: 500 });
  }
}
