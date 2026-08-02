import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

// GET /api/vitals
// The organism's vital signs — the body sensing its own circulation. Aggregates
// real cross-module data into the vitals shown on the Living Home:
//   🫀 pulso · 🩸 circulación (artery patency) · 🔥 agni (digestion) ·
//   🦴 carga (skeletal load) · ⚡ reflejos · ☠️ toxinas · 👤 contribución humana.
// Industry 6.0: the human-contribution pulse celebrates that the body is alive
// because people fed it — not surveillance, vitality.

const DAY = 86_400_000;
const dayKey = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

function lastNDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(new Date(Date.now() - i * DAY)));
  return out;
}

export async function GET(_req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;

  const since30 = new Date(Date.now() - 30 * DAY).toISOString();
  const since30Date = since30.slice(0, 10);
  const todayKey = dayKey(new Date());

  const [
    employeesRes, assignmentsRes, whatsappRes, machinesRes, notificationsRes,
    lotsRes, itemsRes,
  ] = await Promise.allSettled([
    supabaseAdmin.from('employees').select('id, worker_legacy_id'),
    supabaseAdmin.from('worker_assignments').select('employee_id, worker_id, date').gte('date', since30Date).limit(8000),
    supabaseAdmin.from('whatsapp_production_logs').select('review_status, created_at, operator_phone').gte('created_at', since30).limit(4000),
    supabaseAdmin.from('machines').select('status, updated_at'),
    supabaseAdmin.from('notifications').select('created_at').gte('created_at', new Date(Date.now() - 7 * DAY).toISOString()).limit(2000),
    supabaseAdmin.from('inventory_lots').select('certification_code, certification_expires_on, quantity_available, item_id').limit(5000),
    supabaseAdmin.from('inventory_items').select('id, is_certification_required'),
  ]);

  const val = <T,>(r: PromiseSettledResult<{ data: T[] | null }>): T[] =>
    r.status === 'fulfilled' ? (r.value.data ?? []) : [];

  const employees = val<{ id: string; worker_legacy_id: string | null }>(employeesRes);
  const assignments = val<{ employee_id: string | null; worker_id: string | null; date: string }>(assignmentsRes);
  const whatsapp = val<{ review_status: string | null; created_at: string; operator_phone: string | null }>(whatsappRes);
  const machines = val<{ status: string | null; updated_at: string | null }>(machinesRes);
  const notifications = val<{ created_at: string }>(notificationsRes);
  const lots = val<{ certification_code: string | null; certification_expires_on: string | null; quantity_available: number | null; item_id: string }>(lotsRes);
  const items = val<{ id: string; is_certification_required: boolean | null }>(itemsRes);

  // ── 🩸 Circulación — artery patency: do assignments resolve to an employee? ──
  const empIds = new Set(employees.map((e) => e.id));
  const legacyIds = new Set(employees.filter((e) => e.worker_legacy_id).map((e) => String(e.worker_legacy_id)));
  const resolvable = (a: { employee_id: string | null; worker_id: string | null }) =>
    (a.employee_id && empIds.has(a.employee_id)) || (a.worker_id && legacyIds.has(String(a.worker_id)));
  const totalAssign = assignments.length;
  const resolvedAssign = assignments.filter(resolvable).length;
  const unmappedAssign = totalAssign - resolvedAssign;
  const circulationPct = totalAssign === 0 ? 100 : Math.round((resolvedAssign / totalAssign) * 100);

  // ── 🫀 Pulso — assignments per day (the heartbeat), last 7 days ──
  const days7 = lastNDays(7);
  const assignByDay: Record<string, number> = {};
  for (const a of assignments) assignByDay[a.date] = (assignByDay[a.date] ?? 0) + 1;
  const pulseSeries = days7.map((d) => assignByDay[d] ?? 0);
  const pulseToday = assignByDay[todayKey] ?? 0;

  // ── 🔥 Agni — digestion of field captures (approved vs total) ──
  const waApproved = whatsapp.filter((w) => w.review_status === 'approved').length;
  const waPending = whatsapp.filter((w) => w.review_status === 'pending').length;
  const agniPct = whatsapp.length === 0 ? 100 : Math.round((waApproved / whatsapp.length) * 100);

  // ── 👤 Contribución humana — captures from the field (the human pulse) ──
  const waByDay: Record<string, number> = {};
  for (const w of whatsapp) waByDay[dayKey(w.created_at)] = (waByDay[dayKey(w.created_at)] ?? 0) + 1;
  const humanSeries = days7.map((d) => waByDay[d] ?? 0);
  const capturesToday = waByDay[todayKey] ?? 0;
  const activeOperators7 = new Set(
    whatsapp.filter((w) => new Date(w.created_at).getTime() >= Date.now() - 7 * DAY)
      .map((w) => w.operator_phone).filter(Boolean)
  ).size;

  // ── 🦴 Carga — skeletal load (machine utilization snapshot) ──
  const runningMachines = machines.filter((m) => m.status === 'running').length;
  const totalMachines = machines.length;
  const cargaPct = totalMachines === 0 ? 0 : Math.round((runningMachines / totalMachines) * 100);
  const staleMachines = machines.filter((m) => m.status === 'offline').length;

  // ── ⚡ Reflejos — signals fired in the last 7 days ──
  const reflejos7 = notifications.length;

  // ── 🥬 Cert risk — FSSC 22000: in-stock food-grade lots with missing/expired cert ──
  const certRequiredItems = new Set(items.filter((i) => i.is_certification_required).map((i) => i.id));
  const certIssues = lots.filter((l) => {
    if (!certRequiredItems.has(l.item_id)) return false;
    if (Number(l.quantity_available ?? 0) <= 0) return false; // only stock that could still be consumed
    if (!l.certification_code) return true; // missing cert
    return !!l.certification_expires_on && new Date(l.certification_expires_on).getTime() < Date.now(); // expired
  }).length;

  // ── ☠️ Toxinas — ama accumulating (things to clear) ──
  // Antes se contaban los puestos sin máquina detrás. Al fusionar `workstations`
  // dentro de `machines` esa clase de defecto dejó de poder existir: el puesto ES
  // la máquina, así que no hay enlace que se pueda romper.
  const toxins = unmappedAssign + staleMachines + certIssues;

  // ── Composite health score ──
  const reflexScore = reflejos7 > 0 ? 100 : 0;
  let healthScore = Math.round(
    0.45 * circulationPct + 0.2 * agniPct + 0.2 * cargaPct + 0.15 * reflexScore
  );
  healthScore = Math.max(0, Math.min(100, healthScore - Math.min(20, toxins)));
  const healthLabel = healthScore >= 80 ? 'Saludable' : healthScore >= 60 ? 'Atención' : 'Crítico';

  const status = (pct: number, warn = 70, crit = 40) =>
    pct >= warn ? 'flowing' : pct >= crit ? 'stagnant' : 'clotted';

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    health: { score: healthScore, label: healthLabel },
    vitals: {
      pulso: { value: pulseToday, unit: '/día', series: pulseSeries, status: pulseToday > 0 ? 'flowing' : 'stagnant' },
      circulacion: { value: circulationPct, unit: '%', resolved: resolvedAssign, total: totalAssign, status: status(circulationPct, 90, 60) },
      agni: { value: agniPct, unit: '%', pending: waPending, status: status(agniPct) },
      carga: { value: cargaPct, unit: '%', running: runningMachines, total: totalMachines, status: status(cargaPct, 60, 30) },
      reflejos: { value: reflejos7, unit: '/7d', status: reflejos7 > 0 ? 'flowing' : 'stagnant' },
      toxinas: { value: toxins, unmappedAssignments: unmappedAssign, staleMachines, certIssues, status: toxins === 0 ? 'flowing' : toxins <= 5 ? 'stagnant' : 'clotted' },
      humano: { value: capturesToday, unit: 'hoy', series: humanSeries, activeOperators: activeOperators7, status: capturesToday > 0 ? 'flowing' : 'stagnant' },
    },
  });
}
