import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  attributeLabor, groupLinesByOt,
  type ClockEvent, type AssignmentRow, type RateRow,
} from '@/lib/labor-attribution';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics/labor-margin
 *
 * El margen laboral por OT, calculado con el MISMO motor que usa el resto del
 * taller: `labor-attribution.ts`, puro y con 20 tests, que resuelve el operario
 * que olvida marcar salida, el turno que cruza medianoche y la tarifa con fecha
 * de vigencia.
 *
 * Antes esto se recalculaba en el navegador, en unas 300 líneas sin un solo
 * test, mientras el motor probado quedaba sin usar. Dos motores de costo
 * laboral: uno probado y desconectado, otro conectado y sin probar — y el que
 * alimentaba la pantalla del dueño era el segundo.
 *
 * Además el cálculo pasa al servidor porque para hacerlo hay que leer
 * `compensation_rates`, y no hay razón para que las tarifas de cada persona
 * viajen al navegador sólo para sumarlas.
 *
 * DIAGNÓSTICO. Cuando no puede atribuir, dice POR QUÉ en vez de devolver una
 * lista vacía y dejar que la pantalla muestre "sin datos". Hoy la respuesta
 * honesta es que el eslabón no existe: ninguna asignación de trabajo tiene OT.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const otId = searchParams.get('ot_id');

  let asgQuery = supabaseAdmin
    .from('worker_assignments')
    .select('employee_id, workstation_id, ot_id, date, role');
  if (from) asgQuery = asgQuery.gte('date', from);
  if (to) asgQuery = asgQuery.lte('date', to);
  if (otId) asgQuery = asgQuery.eq('ot_id', otId);

  const [{ data: asignaciones }, { data: eventos }, { data: tarifas }, { data: empleados }] =
    await Promise.all([
      asgQuery,
      supabaseAdmin
        .from('attendance_events')
        .select('employee_id, station_id, event_type, at'),
      supabaseAdmin
        .from('compensation_rates')
        .select('employee_id, hourly_rate, currency_code, overtime_multiplier_50, effective_from, effective_to'),
      supabaseAdmin.from('employees').select('id, full_name'),
    ]);

  const conOt = (asignaciones ?? []).filter((a) => a.ot_id);

  // ── Por qué no se puede atribuir, cuando no se puede ──
  const bloqueos: string[] = [];
  if ((asignaciones ?? []).length === 0) {
    bloqueos.push('No hay partes de trabajo en el período.');
  } else if (conOt.length === 0) {
    bloqueos.push(
      `Ninguno de los ${(asignaciones ?? []).length} partes de trabajo del período tiene OT asociada. ` +
      'Sin ese enlace no se puede saber a qué trabajo cargarle las horas. Se completa al asignar la ' +
      'persona a la OT en Planta.'
    );
  }
  if ((eventos ?? []).length === 0) {
    bloqueos.push('No hay marcas de reloj (entrada/salida) registradas: sin ellas no hay horas reales que atribuir.');
  }
  if ((tarifas ?? []).length === 0) {
    bloqueos.push('No hay tarifas por hora cargadas: sin ellas las horas no se pueden convertir a plata.');
  }

  const clockEvents: ClockEvent[] = (eventos ?? [])
    .filter((e) => e.employee_id)
    .map((e) => ({
      employee_id: e.employee_id as string,
      station_id: e.station_id,
      at: e.at as string,
      event_type: e.event_type as string,
    }));

  const assignments: AssignmentRow[] = conOt.map((a) => ({
    employee_id: a.employee_id as string,
    workstation_id: a.workstation_id,
    ot_id: a.ot_id,
    date: a.date,
    role: a.role,
  }));

  const rates: RateRow[] = (tarifas ?? []).map((r) => ({
    employee_id: r.employee_id,
    hourly_rate: Number(r.hourly_rate ?? 0),
    currency_code: r.currency_code,
    overtime_multiplier_50: r.overtime_multiplier_50,
    effective_from: r.effective_from,
    effective_to: r.effective_to,
  }));

  // El motor trabaja DÍA por DÍA a propósito: así resuelve el turno que cruza
  // medianoche y el tope de jornada dentro de su propio marco. Se le pasa cada
  // día por separado y se acumulan las líneas.
  const dias = [...new Set(assignments.map((a) => a.date))].sort();
  const lines = [];
  const warnings = [];
  let unattributedHours = 0;

  for (const date of dias) {
    const delDia = attributeLabor({
      date,
      events: clockEvents.filter((e) => String(e.at).slice(0, 10) === date),
      assignments: assignments.filter((a) => a.date === date),
      rates,
    });
    lines.push(...delDia.lines);
    warnings.push(...delDia.warnings);
    unattributedHours += delDia.unattributedHours;
  }

  const resultado = { lines, warnings, unattributedHours };
  const porOt = groupLinesByOt(resultado.lines);

  const nombre = new Map((empleados ?? []).map((e) => [e.id, e.full_name]));

  const otIds = [...porOt.keys()];
  const { data: ots } = otIds.length
    ? await supabaseAdmin.from('ots').select('id, ot_number, client_name, total_price').in('id', otIds)
    : { data: [] };
  const otById = new Map((ots ?? []).map((o) => [o.id, o]));

  const rows = [...porOt.entries()].map(([ot_id, lineas]) => {
    const o = otById.get(ot_id);
    const total_labor_cost = lineas.reduce((a, l) => a + l.cost, 0);
    const revenue = Number(o?.total_price ?? 0);
    return {
      ot_id,
      ot_number: o?.ot_number ?? null,
      client_name: o?.client_name ?? null,
      revenue,
      total_hours: Math.round(lineas.reduce((a, l) => a + l.hours, 0) * 100) / 100,
      overtime_hours: Math.round(lineas.reduce((a, l) => a + l.overtimeHours, 0) * 100) / 100,
      total_labor_cost: Math.round(total_labor_cost),
      labor_pct_of_revenue: revenue > 0 ? Math.round((total_labor_cost / revenue) * 1000) / 10 : null,
      people: [...new Set(lineas.map((l) => nombre.get(l.employee_id) ?? l.employee_id))],
    };
  });

  rows.sort((a, b) => b.total_labor_cost - a.total_labor_cost);

  return NextResponse.json({
    rows,
    // Las advertencias del motor, que son parte del resultado y no un detalle:
    // un turno sin salida marcada cambia lo que se le cobra a una OT.
    warnings: resultado.warnings,
    unattributed_hours: resultado.unattributedHours,
    diagnostics: {
      assignments_total: (asignaciones ?? []).length,
      assignments_with_ot: conOt.length,
      clock_events: (eventos ?? []).length,
      rates: (tarifas ?? []).length,
      blocked: bloqueos.length > 0,
      // Que la pantalla pueda decir qué falta en vez de "sin datos disponibles".
      reasons: bloqueos,
    },
  });
}
