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

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { formatCLP } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
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
  Star,
  AlertTriangle,
  ChevronRight,
  Network,
  GraduationCap,
  Award,
  Gift,
  Mail,
  Phone,
  CalendarDays,
  MapPin,
  Pencil,
  ArrowUpRight,
} from 'lucide-react';

/** Same taxonomy the ficha form uses — one vocabulary across the module. */
const DEPARTMENTS = [
  'Impresión Offset', 'Pre-Prensa', 'Terminaciones', 'Corte',
  'Troquelado', 'Despacho', 'Bodega', 'Management',
] as const;

const CONTRACT_LABEL: Record<string, string> = {
  full_time: 'Tiempo Completo',
  part_time: 'Medio Tiempo',
  contractor: 'Contratista',
  temporary: 'Temporal',
  intern: 'Pasante',
};

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

/**
 * The app operates in one currency: Chilean pesos, shown as whole pesos.
 * Fractions still exist inside the costing calculations — they just never
 * reach the screen, because nobody quotes a job in centavos.
 */
function formatMoney(amount: number) {
  return formatCLP(amount);
}

interface MergedPerson {
  id: string;
  full_name: string;
  employee_code: string | null;
  department: string | null;
  status: string;
  hire_date: string | null;
  contract: any | null;
  comp: any | null;
  rating: number;
  quality: number;
  speed: number;
  attendance: number;
  teamwork: number;
  skills: any[];
  top: { name: string; level: number } | null;
  email: string | null;
  phone: string | null;
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
          rating: Number(w.overall_rating ?? 0),
          quality: Number(w.quality_score ?? 0),
          speed: Number(w.speed_score ?? 0),
          attendance: Number(w.attendance_score ?? 0),
          teamwork: Number(w.teamwork_rating ?? 0),
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

interface TodayAssignment {
  station: string | null;
  stationId: string | null;
  type: string | null;
  otNumber: string | null;
  extra: number; // additional assignments beyond the first, same day
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

/**
 * Who is clocked in right now, straight from the /estacion QR kiosk.
 * Short staleTime: this is a live floor signal, not reference data.
 */
function usePresentNow() {
  return useQuery<Set<string>>({
    queryKey: ['personas', 'present-now'],
    queryFn: async () => {
      const res = await fetch('/api/attendance/clock', { credentials: 'include' });
      if (!res.ok) return new Set<string>();
      const payload = await res.json().catch(() => null);
      const present: Array<{ employee_id: string }> = payload?.present ?? [];
      return new Set(present.map((p) => p.employee_id));
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
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
  { label: 'Habilidades', href: '/personas/habilidades', icon: Network, desc: 'Competencias y niveles de maestría', accent: 'text-violet-500' },
  { label: 'Capacitación', href: '/personas/capacitacion', icon: GraduationCap, desc: 'Cursos, formación y planes de desarrollo', accent: 'text-teal-500' },
  { label: 'Certificaciones', href: '/personas/certificaciones', icon: Award, desc: 'Acreditaciones y vigencias del personal', accent: 'text-amber-500' },
  { label: 'Incentivos', href: '/personas/incentivos', icon: Gift, desc: 'Bonos, premios y reconocimientos', accent: 'text-rose-500' },
] as const;

function StatCard({ icon: Icon, label, value, tone = 'default' }: {
  icon: any; label: string; value: string; tone?: 'default' | 'warn';
}) {
  return (
    <Card className="p-4 flex items-center gap-3 border-border">
      <div className={`rounded-lg p-2 ${tone === 'warn' ? 'bg-amber-500/10 text-amber-500' : 'bg-primary/10 text-primary'}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold tabular-nums leading-tight text-foreground">{value}</div>
        <div className="text-xs text-muted-foreground truncate">{label}</div>
      </div>
    </Card>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums font-medium text-foreground">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

/**
 * `embedded` — rendered inside the Consola Operativa tab, where the page already
 * supplies the title and the talent section lives on its own route. Standalone
 * rendering keeps both.
 */
export default function PersonasModule({ embedded = false }: { embedded?: boolean } = {}) {
  const { data: people = [], isLoading, isError, error, refetch } = useConsolidatedPeople();
  const { data: roster } = useLatestRoster();
  const { data: presentNow } = usePresentNow();
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
    const ratings = people.filter(p => p.rating > 0).map(p => p.rating);
    const avgRating = ratings.length ? Math.round(ratings.reduce((s, r) => s + r, 0) / ratings.length) : 0;
    const gaps = people.filter(p => !p.contract || !p.comp).length;
    return { active, hourlySum, avgRating, gaps, hasComp: withComp.length > 0 };
  }, [people]);

  return (
    <div className={embedded ? 'space-y-6' : 'p-6 space-y-10 max-w-[1200px] mx-auto'}>
      {!embedded && (
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-amber-500">
            <Users className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-widest">Personas</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Módulo de Personas</h1>
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

        {/* Summary strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Users} label="Empleados activos" value={String(stats.active)} />
          <StatCard
            icon={Wallet}
            label="Costo/hora del equipo"
            value={stats.hasComp ? formatMoney(stats.hourlySum) : '—'}
          />
          <StatCard icon={Star} label="Rating promedio" value={stats.avgRating ? `${stats.avgRating}/100` : '—'} />
          <StatCard
            icon={AlertTriangle}
            label="Con brecha de datos"
            value={String(stats.gaps)}
            tone={stats.gaps > 0 ? 'warn' : 'default'}
          />
        </div>

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

        {/* Table */}
        <Card className="border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[880px]">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-3 pl-4 pr-2 font-semibold w-8"></th>
                  <th className="py-3 px-2 font-semibold">Empleado</th>
                  <th className="py-3 px-2 font-semibold">Departamento</th>
                  <th className="py-3 px-2 font-semibold">Contrato</th>
                  <th className="py-3 px-2 font-semibold text-right">$/hora</th>
                  <th className="py-3 px-2 font-semibold text-right">Rating</th>
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
                      presentNow={presentNow?.has(p.id) ?? false}
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

function FragmentRow({ person: p, expanded, contractType, hrsWeek, assignment, presentNow, onToggle, onSaved }: {
  person: MergedPerson;
  expanded: boolean;
  contractType?: string;
  hrsWeek?: number;
  assignment: TodayAssignment | null;
  presentNow: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  const hasComp = p.comp?.hourly_rate != null;
  return (
    <>
      <tr
        className={`border-b border-border cursor-pointer transition-colors hover:bg-muted/30 ${expanded ? 'bg-muted/30' : ''}`}
        onClick={onToggle}
      >
        <td className="py-3 pl-4 pr-2 text-muted-foreground">
          <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </td>
        <td className="py-3 px-2">
          <div className="flex items-center gap-1.5">
            {/* Live from the station kiosk — green means clocked in right now. */}
            <span
              title={presentNow ? 'Presente ahora (marcó entrada)' : 'Sin marca de entrada activa'}
              aria-label={presentNow ? 'Presente ahora' : 'Ausente'}
              className={`h-2 w-2 shrink-0 rounded-full ${
                presentNow ? 'bg-emerald-500' : 'bg-muted-foreground/25'
              }`}
            />
            <span className="font-semibold text-foreground text-[15px]">{p.full_name}</span>
          </div>
          {p.employee_code && <div className="text-xs text-muted-foreground font-mono pl-3.5">{p.employee_code}</div>}
        </td>
        <td className="py-3 px-2 text-muted-foreground">{p.department || '—'}</td>
        <td className="py-3 px-2">
          {contractType ? (
            <div>
              <div className="text-foreground">{CONTRACT_LABEL[contractType] || contractType}</div>
              {hrsWeek != null && <div className="text-xs text-muted-foreground">{hrsWeek} h/sem</div>}
            </div>
          ) : (
            <Badge variant="outline" className="text-amber-600 border-amber-500/40">Sin contrato</Badge>
          )}
        </td>
        <td className="py-3 px-2 text-right tabular-nums">
          {hasComp ? (
            <span className="font-medium text-foreground">{formatMoney(Number(p.comp.hourly_rate))}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="py-3 px-2 text-right">
          {p.rating > 0 ? (
            <span className="inline-flex items-center gap-1 tabular-nums font-medium text-foreground">
              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />{p.rating}
            </span>
          ) : <span className="text-muted-foreground">—</span>}
        </td>
        <td className="py-3 px-2">
          {p.top ? (
            <span className="text-foreground">
              {p.top.name} <span className="text-muted-foreground">· N{p.top.level}</span>
            </span>
          ) : <span className="text-muted-foreground">—</span>}
        </td>
        <td className="py-3 px-2" onClick={e => e.stopPropagation()}>
          {assignment ? (
            <Link
              href="/operaciones/planta"
              className="group/asg inline-flex flex-col gap-0.5 hover:underline"
            >
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                {assignment.station || 'Estación'}
                {assignment.extra > 0 && (
                  <span className="text-xs text-muted-foreground">+{assignment.extra}</span>
                )}
              </span>
              {assignment.otNumber && (
                <span className="text-xs text-muted-foreground pl-5">OT {assignment.otNumber}</span>
              )}
            </Link>
          ) : (
            <span className="text-muted-foreground">Sin asignar</span>
          )}
        </td>
        <td className="py-3 px-2 pr-4">
          <Badge
            variant="outline"
            className={p.status === 'active'
              ? 'text-emerald-600 border-emerald-500/40 bg-emerald-500/5'
              : 'text-muted-foreground border-border'}
          >
            {p.status === 'active' ? 'Activo' : p.status}
          </Badge>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-muted/20">
          <td></td>
          <td colSpan={8} className="py-4 pr-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Column 1: the editable ficha */}
              <EditableFicha person={p} onSaved={onSaved} />

              {/* Column 2: performance breakdown */}
              <div className="space-y-2.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rendimiento</div>
                <ScoreBar label="Calidad" value={p.quality} />
                <ScoreBar label="Velocidad" value={p.speed} />
                <ScoreBar label="Asistencia" value={p.attendance} />
                <ScoreBar label="Trabajo en equipo" value={p.teamwork} />
              </div>

              {/* Column 3: skills + actions */}
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Competencias</div>
                {p.skills.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {p.skills.map((s: any, i: number) => (
                      <Badge key={i} variant="outline" className="border-border font-normal">
                        {s?.skill?.name || s?.skill?.code}
                        <span className="ml-1 text-muted-foreground">N{s?.proficiency_level ?? '?'}</span>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Sin competencias registradas</div>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link href="/personas/empleados" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <Pencil className="h-3 w-3" /> Editar ficha
                  </Link>
                  <Link href="/personas/nomina" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <Wallet className="h-3 w-3" /> Ver nómina
                  </Link>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * The ficha, editable in place.
 *
 * A person's record spans three tables, so saving fans out to three routes and
 * only sends what actually changed — an untouched wage never hits the
 * compensation endpoint, which keeps the HR compliance log honest about who
 * really changed pay and when.
 */
function EditableFicha({ person, onSaved }: { person: MergedPerson; onSaved: () => void }) {
  const initial = {
    full_name: person.full_name ?? '',
    department: person.department ?? '',
    hire_date: person.hire_date ?? '',
    email: person.email ?? '',
    phone: person.phone ?? '',
    contract_type: person.contract?.contract_type ?? 'full_time',
    hours_per_week: String(person.contract?.hours_per_week ?? ''),
    overtime_allowed: Boolean(person.contract?.overtime_allowed),
    hourly_rate: person.comp?.hourly_rate != null ? String(person.comp.hourly_rate) : '',
  };

  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof initial>) => setForm(f => ({ ...f, ...patch }));

  const dirty = (Object.keys(initial) as Array<keyof typeof initial>).some(
    k => String(form[k]) !== String(initial[k])
  );

  const save = async () => {
    if (!form.full_name.trim()) {
      toast.error('El nombre no puede quedar vacío');
      return;
    }

    setSaving(true);
    const failures: string[] = [];

    const send = async (url: string, method: string, body: unknown, label: string) => {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        failures.push(`${label}: ${b?.error || res.status}`);
      }
    };

    // 1. Identity
    if (
      form.full_name !== initial.full_name ||
      form.department !== initial.department ||
      form.hire_date !== initial.hire_date ||
      form.email !== initial.email ||
      form.phone !== initial.phone
    ) {
      await send(
        `/api/employees/${person.id}`,
        'PUT',
        {
          full_name: form.full_name.trim(),
          department: form.department || null,
          ...(form.hire_date ? { hire_date: form.hire_date } : {}),
          email: form.email || null,
          phone: form.phone || null,
        },
        'ficha'
      );
    }

    // 2. Contract
    if (
      form.contract_type !== initial.contract_type ||
      form.hours_per_week !== initial.hours_per_week ||
      form.overtime_allowed !== initial.overtime_allowed
    ) {
      await send(
        `/api/employees/${person.id}/contract`,
        'PATCH',
        {
          contract_type: form.contract_type,
          ...(form.hours_per_week ? { hours_per_week: Number(form.hours_per_week) } : {}),
          overtime_allowed: form.overtime_allowed,
        },
        'contrato'
      );
    }

    // 3. Rate — only when actually touched.
    if (form.hourly_rate !== initial.hourly_rate && form.hourly_rate.trim()) {
      await send(
        `/api/employees/${person.id}/compensation`,
        'PATCH',
        { hourly_rate: Number(form.hourly_rate) },
        'tarifa'
      );
    }

    setSaving(false);

    if (failures.length > 0) {
      toast.error(`No se guardó todo — ${failures.join(' · ')}`);
    } else {
      toast.success('Ficha actualizada');
    }
    onSaved();
  };

  const field = 'h-8 text-sm';

  return (
    <div className="space-y-2 md:col-span-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ficha — editable
        </div>
        {dirty && <span className="text-xs text-amber-600">sin guardar</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Nombre</label>
          <Input className={field} value={form.full_name} onChange={e => set({ full_name: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Departamento</label>
          <Select value={form.department || undefined} onValueChange={v => set({ department: v })}>
            <SelectTrigger className={field}><SelectValue placeholder="Sin departamento" /></SelectTrigger>
            <SelectContent>
              {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Fecha de ingreso</label>
          <Input type="date" className={field} value={form.hire_date} onChange={e => set({ hire_date: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Tarifa por hora (CLP)</label>
          <Input
            type="number"
            min={0}
            step="1"
            className={field}
            value={form.hourly_rate}
            onChange={e => set({ hourly_rate: e.target.value })}
            placeholder="Ej: 8500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Tipo de contrato</label>
          <Select value={form.contract_type} onValueChange={v => set({ contract_type: v })}>
            <SelectTrigger className={field}><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(CONTRACT_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Horas por semana</label>
          <Input
            type="number"
            min={1}
            max={80}
            className={field}
            value={form.hours_per_week}
            onChange={e => set({ hours_per_week: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Correo</label>
          <Input type="email" className={field} value={form.email} onChange={e => set({ email: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Teléfono</label>
          <Input className={field} value={form.phone} onChange={e => set({ phone: e.target.value })} />
        </div>
      </div>

      <label className="flex w-fit items-center gap-2 pt-1 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={form.overtime_allowed}
          onChange={e => set({ overtime_allowed: e.target.checked })}
        />
        Horas extra permitidas
      </label>

      <div className="flex items-center gap-2 pt-2">
        <Button size="sm" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        {dirty && (
          <Button size="sm" variant="ghost" onClick={() => setForm(initial)} disabled={saving}>
            Descartar
          </Button>
        )}
      </div>
    </div>
  );
}
