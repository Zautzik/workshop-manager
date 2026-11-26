import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError, hasRole } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { fetchAll } from '@/lib/fetch-all';
import type { AppRole } from '@/types/app-role';
import { resolveSalesScope, scopeFilterId } from '@/lib/sales-scope';
import { quoteConversionByMonth } from '@/lib/quote-conversion';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reads/[name] — the server-side reads the browser used to do itself.
 *
 * Seventeen screens read business tables straight from the browser with the
 * user's Supabase session (audit H5, 2026-11-25): payroll, machine economics,
 * Planta's HR context, the calendar. It worked only as long as each table's
 * RLS happened to allow it, failed under the dev login, and meant there was no
 * server door to put a role check, a column choice or a page limit on.
 *
 * This is that door, and it is NOT a generic table proxy: every read is
 * declared here by name with its fixed table, columns, filters and roles. The
 * browser chooses a name and passes parameters, never a table or a column.
 * Adding a read means adding an entry here.
 *
 * Reads that already had a route use it (machine supplies, inventory items,
 * the scheduling cost model) — this only covers the ones that had none.
 */

class BadParam extends Error {}

// Query parameters are validated with zod (src/app/api/CLAUDE.md).
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const UuidList = z
  .string()
  .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
  .pipe(z.array(z.string().uuid()).min(1).max(500));

function date(p: URLSearchParams, key: string): string {
  const r = IsoDate.safeParse(p.get(key) ?? '');
  if (!r.success) throw new BadParam(`\`${key}\` debe ser YYYY-MM-DD`);
  return r.data;
}
function uuids(p: URLSearchParams, key: string): string[] {
  const r = UuidList.safeParse(p.get(key) ?? '');
  if (!r.success) throw new BadParam(`\`${key}\` debe ser una lista de ids`);
  return r.data;
}

const OPS: AppRole[] = ['admin', 'manager', 'supervisor'];
const MGMT: AppRole[] = ['admin', 'manager'];

interface ReadDef {
  roles: AppRole[];
  /** `auth` is the caller — for reads scoped to the user (a vendedor sees only their own). */
  run: (p: URLSearchParams, auth: { id: string; role: AppRole | null }) => Promise<unknown>;
}

/** All rows, paged past PostgREST's 1,000-row cap; `truncated` says if it still stopped. */
const all = <T,>(page: (a: number, b: number) => any) => fetchAll<T>(page);

const READS: Record<string, ReadDef> = {
  // ── Machine economics (Equipos › Economía, Analítica › Máquinas) ─────────
  'machine-costs': {
    roles: OPS,
    run: async () => (await all((a, b) => supabaseAdmin.from('machine_costs').select('*, machines(name, type)').range(a, b))).rows,
  },
  'equipment-investments': {
    roles: OPS,
    run: async () => (await all((a, b) => supabaseAdmin.from('equipment_investments').select('*, machines(name)').range(a, b))).rows,
  },

  // ── Nómina del mes (Analítica › Nómina, Mano de obra) ───────────────────
  // The four datasets the payroll calculation needs; the calculation itself
  // stays in use-financial-queries.ts. Each comes with its own `truncated`.
  'payroll-month': {
    roles: MGMT,
    run: async (p) => {
      const from = date(p, 'from');
      const to = date(p, 'to');
      const [employees, assignments, compensation, incentives] = await Promise.all([
        all((a, b) => supabaseAdmin.from('employees').select('id, full_name').range(a, b)),
        all((a, b) =>
          supabaseAdmin
            .from('worker_assignments')
            .select('employee_id, date, role, hours_worked, shift:shifts(start_time, end_time)')
            .gte('date', from)
            .lte('date', to)
            .range(a, b),
        ),
        all((a, b) =>
          supabaseAdmin
            .from('compensation_rates')
            .select('employee_id, hourly_rate, overtime_multiplier_50, overtime_multiplier_100, night_shift_multiplier, weekend_multiplier, currency_code, effective_from, effective_to')
            .range(a, b),
        ),
        all((a, b) =>
          supabaseAdmin
            .from('employee_incentives')
            .select('employee_id, amount, currency_code, status, awarded_date')
            .gte('awarded_date', from)
            .lte('awarded_date', to)
            .in('status', ['approved', 'paid'])
            .range(a, b),
        ),
      ]);
      return { employees, assignments, compensation, incentives };
    },
  },

  // ── Planta: el contexto de RRHH de un día ───────────────────────────────
  'compensation-on': {
    roles: OPS,
    run: async (p) => {
      const d = date(p, 'date');
      return (
        await all((a, b) =>
          supabaseAdmin
            .from('compensation_rates')
            .select('employee_id, hourly_rate, currency_code, overtime_multiplier_50, overtime_multiplier_100, night_shift_multiplier, weekend_multiplier, effective_from, effective_to')
            .lte('effective_from', d)
            .or(`effective_to.is.null,effective_to.gte.${d}`)
            .range(a, b),
        )
      ).rows;
    },
  },
  'leave-on': {
    roles: OPS,
    run: async (p) => {
      const d = date(p, 'date');
      return (
        await all((a, b) =>
          supabaseAdmin
            .from('leave_requests')
            .select('employee_id, leave_type, status, start_date, end_date')
            .lte('start_date', d)
            .gte('end_date', d)
            .in('status', ['approved', 'pending'])
            .range(a, b),
        )
      ).rows;
    },
  },
  'incentives-between': {
    roles: OPS,
    run: async (p) => {
      const from = date(p, 'from');
      const to = date(p, 'to');
      return (
        await all((a, b) =>
          supabaseAdmin.from('employee_incentives').select('employee_id, status, awarded_date, amount').gte('awarded_date', from).lte('awarded_date', to).range(a, b),
        )
      ).rows;
    },
  },
  'certification-alerts': {
    roles: OPS,
    run: async (p) => {
      const until = date(p, 'until');
      return (
        await all((a, b) =>
          supabaseAdmin
            .from('hr_documents')
            .select('employee_id, title, status, expires_on, doc_type')
            .eq('doc_type', 'certification')
            .not('expires_on', 'is', null)
            .lte('expires_on', until)
            .neq('status', 'archived')
            .range(a, b),
        )
      ).rows;
    },
  },
  contracts: {
    roles: OPS,
    run: async () =>
      (await all((a, b) => supabaseAdmin.from('employment_contracts').select('*').order('id', { ascending: false }).range(a, b))).rows,
  },
  // Publishing a week checks leave and contract limits for the people on it.
  'week-hr-limits': {
    roles: OPS,
    run: async (p) => {
      const ids = uuids(p, 'employee_ids');
      const from = date(p, 'from');
      const to = date(p, 'to');
      const [leave, contracts] = await Promise.all([
        supabaseAdmin
          .from('leave_requests')
          .select('employee_id, leave_type, status, start_date, end_date')
          .in('employee_id', ids)
          .eq('status', 'approved')
          .lte('start_date', to)
          .gte('end_date', from),
        supabaseAdmin
          .from('employment_contracts')
          // The columns are start_date/end_date. The browser version asked for
          // contract_start_date/contract_end_date, which do not exist, so
          // "Publicar semana" failed at this step; aliased to the names Planta
          // reads so its check is unchanged.
          .select('employee_id, contract_start_date:start_date, contract_end_date:end_date, max_hours_per_week, base_hours_per_week, overtime_allowed, overtime_cap_hours_per_week')
          .in('employee_id', ids)
          .lte('start_date', to)
          .or(`end_date.is.null,end_date.gte.${from}`),
      ]);
      if (leave.error) throw new Error(leave.error.message);
      if (contracts.error) throw new Error(contracts.error.message);
      return { leave: leave.data ?? [], contracts: contracts.data ?? [] };
    },
  },

  // ── Cotizaciones: conversión por mes (auditoría M8) ──────────────────────
  // Counts, not rows: how many quotes each month, and how many were signed or
  // converted to production vs rejected or expired. A vendedor sees their own.
  'quote-conversion': {
    roles: ['admin', 'manager', 'supervisor', 'vendedor'],
    run: async (p, auth) => {
      const months = Math.min(24, Math.max(1, Number(p.get('months')) || 6));
      const since = new Date();
      since.setUTCDate(1);
      since.setUTCMonth(since.getUTCMonth() - (months - 1));
      const scope = await resolveSalesScope(auth);
      const { rows } = await all<{ status: string; created_at: string }>((a, b) => {
        let q = supabaseAdmin
          .from('vistos_buenos' as any)
          .select('status, created_at')
          .gte('created_at', since.toISOString().slice(0, 10));
        if (!scope.all) q = q.eq('salesman_id', scopeFilterId(scope));
        return q.range(a, b);
      });
      return quoteConversionByMonth(rows);
    },
  },

  // ── Calendario: licencias aprobadas y fechas de mantención ──────────────
  'leave-dates': {
    roles: ['admin', 'manager', 'supervisor', 'hr_manager'],
    run: async () =>
      (
        await all((a, b) =>
          supabaseAdmin
            .from('leave_requests')
            .select('id, leave_type, start_date, employees(full_name)')
            .eq('status', 'approved')
            .not('start_date', 'is', null)
            .range(a, b),
        )
      ).rows,
  },
  'maintenance-dates': {
    roles: ['admin', 'manager', 'supervisor', 'hr_manager', 'technician'],
    run: async () =>
      (
        await all((a, b) =>
          supabaseAdmin.from('maintenance_work_orders').select('id, title, scheduled_date').not('scheduled_date', 'is', null).range(a, b),
        )
      ).rows,
  },
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  // Authenticated first (src/app/api/CLAUDE.md): an anonymous caller learns
  // nothing, not even which read names exist. Then the read's own roles.
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { name } = await params;
  const def = Object.prototype.hasOwnProperty.call(READS, name) ? READS[name] : undefined;
  if (!def) return NextResponse.json({ error: 'Lectura desconocida' }, { status: 404 });
  if (!hasRole(auth.role, def.roles)) {
    return NextResponse.json({ error: 'Forbidden — insufficient permissions' }, { status: 403 });
  }

  try {
    const data = await def.run(new URL(req.url).searchParams, auth);
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof BadParam) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(`reads/${name}:`, err);
    return NextResponse.json({ error: `No se pudo leer ${name}` }, { status: 500 });
  }
}
