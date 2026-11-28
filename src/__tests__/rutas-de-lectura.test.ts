/**
 * Las rutas de lectura nuevas, contra la base de verdad (2026-11-26).
 *
 * ── Por qué contra Postgres ───────────────────────────────────────────────
 *
 * El error típico de estas rutas no es de lógica sino de esquema: pedir una
 * columna que no existe. Así falló «Publicar semana» en Planta durante meses
 * (`contract_start_date` en vez de `start_date`) y así respondía 500 el cierre
 * desde la etiqueta. Con la base mockeada esas pruebas pasarían igual. Cada
 * prueba de acá compara la respuesta de la ruta con una consulta directa a la
 * misma base: si la ruta lee otra columna, otra tabla o cuenta distinto, falla.
 *
 * Sólo lee. Aun así corre sólo contra el stack local (mismo candado que
 * cierre-desde-la-etiqueta.test.ts) y se saltea sin TEST_SUPABASE_URL:
 *
 *   npx supabase start
 *   npm run test:integracion
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL_LOCAL = process.env.TEST_SUPABASE_URL ?? '';
const KEY_LOCAL = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? '';
const hayStack = Boolean(URL_LOCAL && KEY_LOCAL);

if (hayStack) {
  const host = new URL(URL_LOCAL).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') {
    throw new Error(`TEST_SUPABASE_URL apunta a ${host}: estas pruebas sólo corren contra el stack local.`);
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = URL_LOCAL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = KEY_LOCAL;
}

/** Rol del llamador simulado; `null` = sin sesión. */
let rol: string | null = 'admin';
const ID = '4e1dd2a2-0000-4000-8000-00000000beef';

// requireAuth se mockea (no hay NextAuth en vitest) pero respeta las listas de
// roles que declara cada ruta, igual que la prueba de la etiqueta.
vi.mock('@/lib/api-middleware', () => ({
  requireAuth: async (roles?: string | string[]) => {
    if (!rol) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (roles) {
      const lista = Array.isArray(roles) ? roles : [roles];
      if (!lista.includes(rol)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return { id: ID, email: 'suite@local', name: 'Suite', role: rol };
  },
  isAuthError: (v: unknown) => v instanceof NextResponse,
  hasRole: (r: string | null, allowed: string | string[]) => !!r && (Array.isArray(allowed) ? allowed : [allowed]).includes(r),
}));

const db = hayStack ? createClient(URL_LOCAL, KEY_LOCAL, { auth: { persistSession: false } }) : (null as never);
const req = (path: string) => new NextRequest(`http://localhost${path}`);
const body = async (res: Response) => ({ status: res.status, json: await res.json() });

const plantToday = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parts; // YYYY-MM-DD
};

describe.skipIf(!hayStack)('rutas de lectura contra la base local', () => {
  beforeAll(() => { rol = 'admin'; });

  describe('GET /api/reads/[name]', () => {
    const call = async (name: string, qs = '') => {
      const { GET } = await import('@/app/api/reads/[name]/route');
      return body(await GET(req(`/api/reads/${name}${qs}`), { params: Promise.resolve({ name }) }));
    };

    it('cada lectura declarada responde 200 (sus tablas y columnas existen)', async () => {
      rol = 'admin';
      const month = plantToday().slice(0, 7);
      const { data: emp } = await db.from('employment_contracts').select('employee_id').limit(3);
      const ids = (emp ?? []).map((e) => e.employee_id).join(',');
      const casos: Array<[string, string]> = [
        ['machine-costs', ''],
        ['equipment-investments', ''],
        ['payroll-month', `?from=${month}-01&to=${month}-28`],
        ['compensation-on', `?date=${plantToday()}`],
        ['leave-on', `?date=${plantToday()}`],
        ['incentives-between', `?from=${month}-01&to=${month}-28`],
        ['certification-alerts', `?until=${plantToday()}`],
        ['contracts', ''],
        ['week-hr-limits', `?employee_ids=${ids}&from=${month}-01&to=${month}-07`],
        ['quote-conversion', '?months=6'],
        ['leave-dates', ''],
        ['maintenance-dates', ''],
      ];
      for (const [name, qs] of casos) {
        const r = await call(name, qs);
        expect(r.status, `${name}: ${JSON.stringify(r.json).slice(0, 200)}`).toBe(200);
      }
    });

    it('«Publicar semana» recibe las fechas de contrato (antes pedía columnas inexistentes)', async () => {
      const { data: c } = await db.from('employment_contracts').select('employee_id, start_date').not('start_date', 'is', null).limit(1);
      if (!c?.length) return;
      const r = await call('week-hr-limits', `?employee_ids=${c[0].employee_id}&from=2000-01-01&to=2100-01-01`);
      expect(r.status).toBe(200);
      expect(r.json.data.contracts[0].contract_start_date).toBe(c[0].start_date);
    });

    it('sin sesión 401; nombre desconocido 404; parámetro malo 400; rol sin permiso 403', async () => {
      rol = null;
      expect((await call('contracts')).status).toBe(401);
      rol = 'admin';
      expect((await call('no-existe')).status).toBe(404);
      expect((await call('leave-on', '?date=26-11-2026')).status).toBe(400);
      rol = 'vendedor';
      expect((await call('payroll-month', '?from=2026-11-01&to=2026-11-30')).status).toBe(403);
      rol = 'admin';
    });
  });

  describe('GET /api/ots', () => {
    const call = async (qs: string) => {
      const { GET } = await import('@/app/api/ots/route');
      return body(await GET(req(`/api/ots?${qs}`)));
    };

    it('active=true trae TODAS las OT en curso, sin tope', async () => {
      const { count } = await db.from('ots').select('id', { count: 'exact', head: true }).neq('status', 'completed');
      const r = await call('active=true');
      expect(r.status).toBe(200);
      expect(r.json.data.length).toBe(count);
    });

    it('q= encuentra una OT más vieja que las 200 más nuevas', async () => {
      const { data } = await db.from('ots').select('ot_number').order('created_at', { ascending: true }).limit(1);
      const oldest = data?.[0]?.ot_number;
      if (!oldest) return;
      const r = await call(`q=${encodeURIComponent(oldest)}&limit=10`);
      expect(r.status).toBe(200);
      expect(r.json.data.map((o: any) => o.ot_number)).toContain(oldest);
    });
  });

  it('GET /api/machines/activity suma las mismas horas que el libro', async () => {
    const { GET } = await import('@/app/api/machines/activity/route');
    const r = await body(await GET(req('/api/machines/activity')));
    expect(r.status).toBe(200);
    const s = r.json.summary;
    const byStage = (s.unattributed_by_stage as Array<{ hours: number }>).reduce((a, x) => a + x.hours, 0);
    const byMachine = (r.json.machines as Array<{ production_hours: number }>).reduce((a, m) => a + m.production_hours, 0);
    // Lo ubicado en una máquina + lo que quedó «sin precisar» = el total.
    expect(byMachine + byStage).toBeCloseTo(s.total_production_hours, 0);
    expect(s.unattributed_hours).toBeCloseTo(byStage, 1);
  });

  it('GET /api/analytics/labor-by-person: horas = suma de las líneas de mano de obra, por employee_id', async () => {
    const { GET } = await import('@/app/api/analytics/labor-by-person/route');
    const from = '2000-01-01';
    const r = await body(await GET(req(`/api/analytics/labor-by-person?from=${from}`)));
    expect(r.status).toBe(200);
    // Paged like the route: PostgREST returns at most 1,000 rows per request,
    // and a one-shot query here would compare the route against a truncated sum.
    let total = 0;
    for (let from_ = 0; ; from_ += 1000) {
      const { data: page, error } = await db
        .from('ot_cost_lines')
        .select('quantity')
        .eq('kind', 'actual')
        .eq('category', 'labor')
        .eq('ref_type', 'stage_pass')
        .like('description', 'Mano de obra — %')
        .gte('occurred_at', from)
        .order('id')
        .range(from_, from_ + 999);
      if (error) throw error;
      total += (page ?? []).reduce((a, l) => a + Number(l.quantity ?? 0), 0);
      if ((page ?? []).length < 1000) break;
    }
    const routeTotal = (r.json.people as Array<{ hours: number }>).reduce((a, p) => a + p.hours, 0);
    expect(routeTotal).toBeCloseTo(total, 0);
    expect((r.json.people as Array<{ employee_id: string | null }>).every((p) => p.employee_id)).toBe(true);
  });

  it('GET /api/inbox: ítems según el rol y conteos iguales a la base', async () => {
    const { GET } = await import('@/app/api/inbox/route');
    rol = 'technician';
    let r = await body(await GET());
    expect(r.json.items.map((i: any) => i.key)).toEqual(['maintenance']);

    rol = 'admin';
    r = await body(await GET());
    const late = r.json.items.find((i: any) => i.key === 'late');
    const { count } = await db
      .from('ots')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'completed')
      .lt('deadline', plantToday());
    expect(late.error).toBeFalsy();
    expect(late.count).toBe(count);
    const captures = r.json.items.find((i: any) => i.key === 'captures');
    const { count: pend } = await db.from('capture_events').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    expect(captures.count).toBe(pend);
  });
});
