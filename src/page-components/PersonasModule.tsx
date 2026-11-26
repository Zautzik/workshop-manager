'use client';

/**
 * PersonasModule — the consolidated /personas home.
 *
 * Replaces the old hex-hub landing (which fanned out to 8 separate sub-pages)
 * with two purposeful sections:
 *   §1 Consola Operativa      — one row per person: identity + contract + salary
 *                               + performance, over /api/employees + /api/workers.
 *   §2 Centro de Desarrollo   — kept DISTINCT (skills, training, certs, incentives).
 *                               de Talento
 *
 * The two data sources join cleanly on employee.id === worker.id (verified 1:1),
 * so no schema change is needed — this is UI composition over data that already
 * lives together server-side.
 */

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  Search,
  Wallet,
  Clock,
  ChevronDown,
  AlertTriangle,
  Network,
  GraduationCap,
  Award,
  Gift,
  Mail,
  Phone,
  CalendarDays,
  ArrowUpRight,
} from 'lucide-react';
import { formatMoney, type MergedPerson, type TodayAssignment } from './personas-shared';
import { StatsBar } from '@/components/ui/stats-bar';
import { FragmentRow, PersonDetail } from './FragmentRow';
import { MobileCardList, MobileCard } from '@/components/layout/MobileCardList';

// Pick the row that's currently in force: the one with no end date, else the most
// recent by its start field. Contracts and comp rates share this shape.
function pickCurrent<T extends Record<string, any>>(
  rows: T[] | undefined | null,
  startField: string,
  endField: string
): T | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const open = rows.find(r => !r[endField]);
  if (open) return open;
  return [...rows].sort((a, b) =>
    String(b[startField] ?? '').localeCompare(String(a[startField] ?? ''))
  )[0];
}

function topSkill(worker: any): { name: string; level: number } | null {
  const skills = Array.isArray(worker?.employee_skills) ? worker.employee_skills : [];
  let best: { name: string; level: number } | null = null;
  for (const entry of skills) {
    const level = Number(entry?.proficiency_level ?? 0);
    const name = entry?.skill?.name || entry?.skill?.code || '';
    if (!name) continue;
    if (!best || level > best.level) best = { name, level };
  }
  return best;
}

function useConsolidatedPeople() {
  return useQuery<MergedPerson[]>({
    queryKey: ['personas', 'console'],
    queryFn: async () => {
      const [empRes, wkrRes] = await Promise.all([
        fetch('/api/employees?limit=200', { credentials: 'include' }),
        fetch('/api/workers?limit=200', { credentials: 'include' }),
      ]);

      const empPayload = await empRes.json().catch(() => null);
      const wkrPayload = await wkrRes.json().catch(() => null);

      if (!empRes.ok) {
        throw new Error(empPayload?.error || 'No se pudo cargar la lista de empleados');
      }

      const employees: any[] = Array.isArray(empPayload)
        ? empPayload
        : empPayload?.data ?? [];
      const workers: any[] = Array.isArray(wkrPayload)
        ? wkrPayload
        : wkrPayload?.data ?? [];

      const workerById = new Map(workers.map(w => [w.id, w]));

      return employees.map((e): MergedPerson => {
        const w = workerById.get(e.id) ?? {};
        return {
          id: e.id,
          full_name: e.full_name ?? w.full_name ?? '—',
          employee_code: e.employee_code ?? null,
          department: e.department ?? w.department ?? null,
          status: e.status ?? w.status ?? 'active',
          hire_date: e.hire_date ?? w.hire_date ?? null,
          contract: pickCurrent(e.employment_contracts, 'start_date', 'end_date'),
          comp: pickCurrent(e.compensation_rates, 'effective_from', 'effective_to'),
          rating: score(w.overall_rating),
          quality: score(w.quality_score),
          speed: score(w.speed_score),
          attendance: score(w.attendance_score),
          teamwork: score(w.teamwork_rating),
          skills: Array.isArray(w.employee_skills) ? w.employee_skills : [],
          top: topSkill(w),
          email: w.email ?? null,
          phone: w.phone ?? null,
        };
      });
    },
    staleTime: 60 * 1000,
  });
}

/** A stored evaluation, or null when there is none. */
function score(v: unknown): number | null {
  return v === null || v === undefined || v === '' ? null : Number(v);
}

/**
 * Hours each person worked this month, from the ledger (the labour lines
 * written when a pass closes). Replaces the "Rating" that was a column default.
 */
function useHoursThisMonth() {
  return useQuery<Map<string, number>>({
    queryKey: ['personas', 'hours-this-month'],
    queryFn: async () => {
      const res = await fetch('/api/analytics/labor-by-person', { credentials: 'include' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'No se pudieron cargar las horas');
      const map = new Map<string, number>();
      for (const p of payload?.people ?? []) if (p.employee_id) map.set(p.employee_id, Number(p.hours) || 0);
      return map;
    },
    staleTime: 60 * 1000,
  });
}

function useLatestRoster() {
  return useQuery<{ date: string; byEmployee: Map<string, TodayAssignment> }>({
    queryKey: ['personas', 'latest-roster'],
    queryFn: async () => {
      const res = await fetch('/api/worker-assignments?latest=1', { credentials: 'include' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'No se pudo cargar la asignación');

      const assignments: any[] = payload?.assignments ?? [];
      const byEmployee = new Map<string, TodayAssignment>();
      for (const a of assignments) {
        const existing = byEmployee.get(a.employee_id);
        if (existing) {
          existing.extra += 1;
          continue;
        }
        byEmployee.set(a.employee_id, {
          station: a.workstation?.name ?? null,
          stationId: a.workstation?.id ?? a.workstation_id ?? null,
          type: a.workstation?.type ?? null,
          otNumber: a.ot_number ?? null,
          extra: 0,
        });
      }
      return { date: payload?.date ?? '', byEmployee };
    },
    staleTime: 60 * 1000,
  });
}

function rosterLabel(date: string): string {
  if (!date) return 'Asignado';
  const today = new Date().toISOString().split('T')[0];
  if (date === today) return 'Asignado hoy';
  try {
    const d = new Date(`${date}T00:00:00`);
    return `Asignado · ${d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}`;
  } catch {
    return 'Asignado';
  }
}

const DEV_LINKS = [
  { label: 'Habilidades', href: '/personas/talento?tab=habilidades', icon: Network, desc: 'Competencias y niveles de maestría', accent: 'text-violet-500' },
  { label: 'Capacitación', href: '/personas/talento?tab=capacitacion', icon: GraduationCap, desc: 'Cursos, formación y planes de desarrollo', accent: 'text-teal-500' },
  { label: 'Certificaciones', href: '/personas/talento?tab=certificaciones', icon: Award, desc: 'Acreditaciones y vigencias del personal', accent: 'text-amber-500' },
  { label: 'Incentivos', href: '/personas/talento?tab=incentivos', icon: Gift, desc: 'Bonos, premios y reconocimientos', accent: 'text-rose-500' },
] as const;

/**
 * `embedded` — rendered inside the Consola Operativa tab, where the page already
 * supplies the title and the talent section lives on its own route. Standalone
 * rendering keeps both.
 */
export default function PersonasModule({ embedded = false }: { embedded?: boolean } = {}) {
  const { data: people = [], isLoading, isError, error, refetch } = useConsolidatedPeople();
  const { data: roster } = useLatestRoster();
  const { data: hoursById } = useHoursThisMonth();
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rosterByEmployee = roster?.byEmployee ?? new Map<string, TodayAssignment>();
  const assignedColLabel = rosterLabel(roster?.date ?? '');

  const departments = useMemo(() => {
    const set = new Set<string>();
    people.forEach(p => p.department && set.add(p.department));
    return Array.from(set).sort();
  }, [people]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter(p => {
      if (dept !== 'all' && p.department !== dept) return false;
      if (!q) return true;
      return (
        p.full_name.toLowerCase().includes(q) ||
        (p.employee_code || '').toLowerCase().includes(q) ||
        (p.department || '').toLowerCase().includes(q) ||
        (p.top?.name || '').toLowerCase().includes(q)
      );
    });
  }, [people, search, dept]);

  const stats = useMemo(() => {
    const active = people.length;
    const withComp = people.filter(p => p.comp?.hourly_rate != null);
    const hourlySum = withComp.reduce((s, p) => s + Number(p.comp.hourly_rate || 0), 0);
    const hoursMonth = hoursById ? [...hoursById.values()].reduce((s, h) => s + h, 0) : null;
    const gaps = people.filter(p => !p.contract || !p.comp).length;
    return { active, hourlySum, hoursMonth, gaps, hasComp: withComp.length > 0 };
  }, [people, hoursById]);

  return (
    <div className={embedded ? 'space-y-6' : 'p-6 space-y-10 max-w-[1200px] mx-auto'}>
      {!embedded && (
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-amber-500">
            <Users className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-widest">Personas</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Módulo de Personas</h1>
          <p className="text-sm text-muted-foreground">
            Una consola operativa para el día a día y un centro de desarrollo de talento, como secciones distintas.
          </p>
        </header>
      )}

      <section className="space-y-4">
        {!embedded && (
          <>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs font-semibold text-primary tracking-wide">SECCIÓN 1</span>
              <h2 className="text-xl font-bold text-foreground">Consola Operativa</h2>
            </div>
            <p className="text-sm text-muted-foreground -mt-2">
              Quién es cada persona, cuánto cuesta y qué sabe hacer — en una sola fila. Toca una fila para ver el detalle.
            </p>
          </>
        )}

        {/* Summary strip — the shared slim bar (audit M5), not four big cards. */}
        <StatsBar
          stats={[
            { icon: Users, label: 'Empleados activos', value: String(stats.active) },
            { icon: Wallet, label: 'Costo/hora del equipo', value: stats.hasComp ? formatMoney(stats.hourlySum) : '—' },
            { icon: Clock, label: 'Horas este mes', value: stats.hoursMonth != null ? `${Math.round(stats.hoursMonth).toLocaleString('es-CL')} h` : '—', tone: 'primary' },
            { icon: AlertTriangle, label: 'Con brecha de datos', value: String(stats.gaps), count: stats.gaps, tone: 'warning', hideWhenZero: true },
          ]}
        />

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre, código, departamento o competencia…"
              className="pl-9"
            />
          </div>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="sm:w-56">
              <SelectValue placeholder="Departamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los departamentos</SelectItem>
              {departments.map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Phone: one card per person; tapping opens the same detail as the
            desktop row (PersonDetail) right under it (F3). */}
        <Card className="border-border overflow-hidden md:hidden">
          {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Cargando equipo…</p>}
          {isError && <p className="py-8 text-center text-sm text-destructive">{(error as Error)?.message || 'No se pudo cargar el equipo.'}</p>}
          {!isLoading && !isError && filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin resultados para este filtro.</p>
          )}
          <MobileCardList>
            {filtered.map((p) => {
              const expanded = expandedId === p.id;
              const hours = hoursById ? hoursById.get(p.id) ?? 0 : null;
              return (
                <Fragment key={p.id}>
                  <MobileCard
                    title={p.full_name}
                    meta={[
                      p.department,
                      p.comp?.hourly_rate != null ? `${formatMoney(Number(p.comp.hourly_rate))}/h` : 'sin tarifa',
                      hours ? `${hours.toLocaleString('es-CL')} h este mes` : null,
                    ]}
                    onClick={() => setExpandedId(expanded ? null : p.id)}
                    actions={<ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />}
                  />
                  {expanded && (
                    <li className="bg-muted/20 px-3 py-4">
                      <PersonDetail person={p} onSaved={() => refetch()} />
                    </li>
                  )}
                </Fragment>
              );
            })}
          </MobileCardList>
        </Card>

        {/* Table */}
        <Card className="hidden border-border overflow-hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[880px]">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-3 pl-4 pr-2 font-semibold w-8"></th>
                  <th className="py-3 px-2 font-semibold">Empleado</th>
                  <th className="py-3 px-2 font-semibold">Departamento</th>
                  <th className="py-3 px-2 font-semibold">Contrato</th>
                  <th className="py-3 px-2 font-semibold text-right">$/hora</th>
                  <th className="py-3 px-2 font-semibold text-right" title="Horas cargadas al cerrar pasadas este mes">Horas mes</th>
                  <th className="py-3 px-2 font-semibold">Competencia principal</th>
                  <th className="py-3 px-2 font-semibold">{assignedColLabel}</th>
                  <th className="py-3 px-2 pr-4 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">Cargando equipo…</td></tr>
                )}
                {isError && (
                  <tr><td colSpan={9} className="py-10 text-center text-destructive">
                    {(error as Error)?.message || 'No se pudo cargar el equipo.'}
                  </td></tr>
                )}
                {!isLoading && !isError && filtered.length === 0 && (
                  <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">
                    Sin resultados para este filtro.
                  </td></tr>
                )}
                {filtered.map(p => {
                  const expanded = expandedId === p.id;
                  const contractType = p.contract?.contract_type;
                  const hrsWeek = p.contract?.hours_per_week ?? p.contract?.base_hours_per_week;
                  return (
                    <FragmentRow
                      key={p.id}
                      person={p}
                      expanded={expanded}
                      contractType={contractType}
                      hrsWeek={hrsWeek}
                      assignment={rosterByEmployee.get(p.id) ?? null}
                      hoursMonth={hoursById ? hoursById.get(p.id) ?? 0 : null}
                      onSaved={() => refetch()}
                      onToggle={() => setExpandedId(expanded ? null : p.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="text-xs text-muted-foreground">
          Contrato y sueldo provienen de <span className="font-mono">/api/employees</span> (visible sólo para RRHH);
          rendimiento y competencias, de <span className="font-mono">/api/workers</span>. Se unen por empleado.
        </p>
      </section>

      {/* Talent development is its own workspace at /personas/talento; when this
          module is embedded in the operational console it must not duplicate it. */}
      {!embedded && (
        <section className="space-y-4">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-xs font-semibold text-emerald-500 tracking-wide">SECCIÓN 2</span>
            <h2 className="text-xl font-bold text-foreground">Centro de Desarrollo de Talento</h2>
          </div>
          <p className="text-sm text-muted-foreground -mt-2">
            Cómo crece cada persona. Distinto de la operación: otra cadencia, otra intención — desarrollar, no despachar el turno.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {DEV_LINKS.map(link => (
              <Link key={link.href} href={link.href} className="group">
                <Card className="p-5 h-full border-border transition-colors hover:border-primary/40 hover:bg-muted/30">
                  <div className="flex items-center justify-between mb-3">
                    <link.icon className={`h-6 w-6 ${link.accent}`} />
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="font-semibold text-foreground">{link.label}</div>
                  <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{link.desc}</div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

