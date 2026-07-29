'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, ShieldAlert, GraduationCap, Plus, UserCheck, UserMinus, Clock, Award, ClipboardList,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  OPERATOR_STATUS_LABEL, COVERAGE_RISK_LABEL,
  type OperatorStatus, type CoverageRisk,
} from '@/lib/machine-competency';
import { machineTypeLabel } from '@/types/machine-type';

interface MachineRow { id: string; name: string; type: string }
interface SkillRow { id: string; code: string; name: string; category: string | null }

interface CompetencyResponse {
  machine: { id: string; name: string; type: string; min_qualified_operators: number };
  requirements: Array<{
    skill_id: string; skill_name: string | null; min_proficiency: number;
    is_critical: boolean; requires_certification?: boolean | null;
    supervised_hours_required?: number | null;
  }>;
  coverage: {
    risk: CoverageRisk; qualified: number; supervisedOnly: number;
    minRequired: number; shortfall: number; reason: string;
    closestCandidates: Array<{ employeeId: string; readiness: number; nextStep: unknown }>;
  };
  people: Array<{
    employee_id: string; name: string; department: string | null; status: string | null;
    evaluation: {
      status: OperatorStatus; readiness: number; reason: string;
      canOperateAlone: boolean; canOperateSupervised: boolean;
      gaps: Array<{
        skill_id: string; skill_name: string | null; required: number; current: number;
        gap: number; is_critical: boolean; needsCertification: boolean;
        missingSupervisedHours: number | null;
      }>;
      nextStep: { skill_name: string | null; required: number; current: number } | null;
    };
  }>;
  training_path: Array<{
    id: string; step_order: number; title: string; description: string | null;
    estimated_hours: number | null; target_proficiency: number | null;
    skills: { name: string } | null;
    training_articles: { title: string; slug: string } | null;
  }>;
}

const RISK_STYLE: Record<CoverageRisk, string> = {
  sin_datos: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
  critico:   'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  ajustado:  'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  ok:        'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
};

const STATUS_STYLE: Record<OperatorStatus, { badge: string; icon: typeof UserCheck }> = {
  habilitado:            { badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30', icon: UserCheck },
  con_supervision:       { badge: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',                 icon: GraduationCap },
  certificacion_vencida: { badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',         icon: Clock },
  no_habilitado:         { badge: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30',         icon: UserMinus },
};

export function CompetenciasPanel() {
  const qc = useQueryClient();
  const [machineId, setMachineId] = useState('');

  const { data: machines, isLoading: loadingMachines } = useQuery<MachineRow[]>({
    queryKey: ['machines', 'competencias'],
    queryFn: async () => {
      const res = await fetch('/api/machines');
      if (!res.ok) throw new Error('No se pudieron cargar las máquinas');
      const json = await res.json();
      return Array.isArray(json) ? json : (json.machines ?? []);
    },
  });

  const { data: skills } = useQuery<SkillRow[]>({
    queryKey: ['skills', 'catalogo'],
    queryFn: async () => {
      const res = await fetch('/api/skills');
      if (!res.ok) throw new Error('No se pudieron cargar las competencias');
      const json = await res.json();
      return Array.isArray(json) ? json : (json.skills ?? []);
    },
  });

  const { data, isLoading } = useQuery<CompetencyResponse>({
    queryKey: ['machine-competency', machineId],
    enabled: !!machineId,
    queryFn: async () => {
      const res = await fetch(`/api/machines/${machineId}/competency`);
      if (!res.ok) throw new Error('No se pudo cargar la cobertura');
      return res.json();
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['machine-competency'] });

  if (loadingMachines) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <Label>Máquina</Label>
            <Select value={machineId} onValueChange={setMachineId}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Elige una máquina" />
              </SelectTrigger>
              <SelectContent>
                {(machines ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {machineTypeLabel(m.type)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!machineId && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Users className="mx-auto h-10 w-10 opacity-40" />
            <p className="mt-3 text-sm">
              Elige una máquina para ver de cuánta gente depende y quién está más cerca
              de poder operarla.
            </p>
          </CardContent>
        </Card>
      )}

      {machineId && isLoading && <Skeleton className="h-96 w-full" />}

      {machineId && data && (
        <>
          {/* ── El factor bus ────────────────────────────────────────── */}
          <Card className={data.coverage.risk === 'critico' ? 'border-red-500/40' : undefined}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldAlert className="h-4 w-4" />
                  Cobertura de operarios
                </CardTitle>
                <Badge variant="outline" className={RISK_STYLE[data.coverage.risk]}>
                  {COVERAGE_RISK_LABEL[data.coverage.risk]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{data.coverage.reason}</p>

              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Habilitados" value={data.coverage.qualified}
                  tone={data.coverage.qualified <= 1 ? 'red' : 'emerald'} />
                <Metric label="En formación" value={data.coverage.supervisedOnly} tone="sky" />
                <Metric label="Mínimo definido" value={data.coverage.minRequired} tone="slate" />
              </div>

              {data.requirements.length === 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
                  Esta máquina no tiene competencias declaradas. Mientras esté así, la app no
                  puede afirmar quién está habilitado — y programar a alguien en ella es una
                  decisión a ciegas. Defínelas abajo.
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Requisitos ───────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Qué exige esta máquina</CardTitle>
                <div className="flex items-center gap-2">
                  <PlantillaCompetenciasDialog machineId={machineId} onApplied={invalidate} />
                  <NuevoRequisitoDialog
                    machineId={machineId}
                    skills={skills ?? []}
                    yaExigidas={data.requirements.map((r) => r.skill_id)}
                    onSaved={invalidate}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {data.requirements.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sin requisitos declarados.
                </p>
              ) : (
                <ul className="divide-y">
                  {data.requirements.map((r) => (
                    <li key={r.skill_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div>
                        <span className="font-medium">{r.skill_name ?? 'Competencia'}</span>
                        <span className="ml-2 text-sm text-muted-foreground">
                          nivel {r.min_proficiency} mínimo
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.is_critical && (
                          <Badge variant="outline" className="border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300">
                            Crítica
                          </Badge>
                        )}
                        {r.requires_certification && (
                          <Badge variant="outline" className="gap-1">
                            <Award className="h-3 w-3" /> Certificación
                          </Badge>
                        )}
                        {r.supervised_hours_required != null && (
                          <Badge variant="secondary" className="gap-1">
                            <Clock className="h-3 w-3" /> {r.supervised_hours_required} h acompañado
                          </Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* ── Personas ─────────────────────────────────────────────── */}
          {data.people.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Quién puede operarla</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {data.people.map((p) => {
                    const st = STATUS_STYLE[p.evaluation.status];
                    const Icon = st.icon;
                    return (
                      <li key={p.employee_id} className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{p.name}</span>
                              {p.department && (
                                <span className="text-xs text-muted-foreground">{p.department}</span>
                              )}
                              {p.status === 'on_leave' && (
                                <Badge variant="secondary" className="text-xs">Con permiso</Badge>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {p.evaluation.reason}
                            </p>

                            <div className="mt-2 max-w-xs">
                              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                <div
                                  className={`h-full rounded-full ${
                                    p.evaluation.readiness === 100 ? 'bg-emerald-500'
                                      : p.evaluation.readiness >= 60 ? 'bg-sky-500' : 'bg-slate-400'
                                  }`}
                                  style={{ width: `${p.evaluation.readiness}%` }}
                                />
                              </div>
                              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                                {p.evaluation.readiness}% del requisito cubierto
                                {p.evaluation.nextStep && (
                                  <> · próximo: {p.evaluation.nextStep.skill_name} (nivel{' '}
                                    {p.evaluation.nextStep.current} → {p.evaluation.nextStep.required})</>
                                )}
                              </p>
                            </div>
                          </div>

                          <Badge variant="outline" className={`gap-1 ${st.badge}`}>
                            <Icon className="h-3 w-3" />
                            {OPERATOR_STATUS_LABEL[p.evaluation.status]}
                          </Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* ── Ruta de formación ────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <GraduationCap className="h-4 w-4" />
                  Cómo se enseña esta máquina
                </CardTitle>
                <NuevoPasoDialog
                  machineId={machineId}
                  skills={skills ?? []}
                  siguienteOrden={(data.training_path.at(-1)?.step_order ?? 0) + 1}
                  onSaved={invalidate}
                />
              </div>
            </CardHeader>
            <CardContent>
              {data.training_path.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sin ruta definida. Escribir los pasos es lo que convierte &quot;sólo Guillermo
                  sabe&quot; en algo que otra persona puede aprender.
                </p>
              ) : (
                <ol className="space-y-3">
                  {data.training_path.map((s) => (
                    <li key={s.id} className="flex gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                        {s.step_order}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{s.title}</p>
                        {s.description && (
                          <p className="text-sm text-muted-foreground">{s.description}</p>
                        )}
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {s.skills?.name && <span>{s.skills.name}</span>}
                          {s.target_proficiency && <span>· hasta nivel {s.target_proficiency}</span>}
                          {s.estimated_hours != null && <span>· {s.estimated_hours} h</span>}
                          {s.training_articles?.title && (
                            <span>· material: {s.training_articles.title}</span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

const TONE: Record<string, string> = {
  red: 'text-red-600 dark:text-red-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  sky: 'text-sky-600 dark:text-sky-400',
  slate: 'text-muted-foreground',
};

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${TONE[tone]}`}>{value}</p>
    </div>
  );
}

interface CompTemplateItem {
  skill_id: string;
  skill_name: string;
  skill_code: string;
  min_proficiency: number;
  is_critical: boolean;
  requires_certification?: boolean;
  supervised_hours_required?: number;
  reason?: string;
  already_present: boolean;
}

function PlantillaCompetenciasDialog({
  machineId, onApplied,
}: {
  machineId: string; onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<{
    machine: { name: string; type: string };
    items: CompTemplateItem[];
    missing_from_catalog: string[];
  }>({
    queryKey: ['competency-template', machineId],
    enabled: open,
    queryFn: async () => {
      const res = await fetch(`/api/machines/${machineId}/competency/template`);
      if (!res.ok) throw new Error('No se pudo cargar la plantilla');
      const json = await res.json();
      setMarcadas(new Set(json.items.filter((i: CompTemplateItem) => !i.already_present).map((i: CompTemplateItem) => i.skill_id)));
      return json;
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      const items = (data?.items ?? [])
        .filter((i) => marcadas.has(i.skill_id))
        .map((i) => ({
          skill_id: i.skill_id,
          min_proficiency: i.min_proficiency,
          is_critical: i.is_critical,
          requires_certification: i.requires_certification ?? false,
          supervised_hours_required: i.supervised_hours_required ?? null,
        }));
      const res = await fetch(`/api/machines/${machineId}/competency/template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo aplicar');
      return json;
    },
    onSuccess: (json) => {
      toast.success(`${json.applied} competencias exigidas. La cobertura ya se puede calcular.`);
      setOpen(false);
      onApplied();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) =>
    setMarcadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <ClipboardList className="h-4 w-4" /> Partir de una plantilla
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Competencias habituales de {data ? machineTypeLabel(data.machine.type).toLowerCase() : 'esta máquina'}
          </DialogTitle>
        </DialogHeader>

        {isLoading && <Skeleton className="h-56 w-full" />}

        {data && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Los niveles son un punto de partida, no una verdad: ajústalos después según
              qué tan exigente sea el taller.
            </p>

            {data.missing_from_catalog.length > 0 && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                La plantilla también sugiere {data.missing_from_catalog.join(', ')}, que no
                existen en el catálogo de competencias. Créalas en Personas → Desarrollo si
                aplican a esta máquina.
              </p>
            )}

            <ul className="space-y-1">
              {data.items.map((i) => (
                <li key={i.skill_id}>
                  <label
                    className={`flex cursor-pointer items-start gap-2.5 rounded-md p-2 text-sm transition-colors hover:bg-muted/60 ${
                      i.already_present ? 'opacity-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-current"
                      checked={marcadas.has(i.skill_id)}
                      onChange={() => toggle(i.skill_id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {i.skill_name}
                        <span className="text-xs text-muted-foreground">nivel {i.min_proficiency}</span>
                        {i.is_critical && (
                          <Badge variant="outline" className="border-red-500/30 bg-red-500/15 text-[0.65rem] text-red-700 dark:text-red-300">
                            crítica
                          </Badge>
                        )}
                        {i.requires_certification && (
                          <Badge variant="outline" className="gap-1 text-[0.65rem]">
                            <Award className="h-2.5 w-2.5" /> certificación
                          </Badge>
                        )}
                        {i.supervised_hours_required != null && (
                          <Badge variant="secondary" className="gap-1 text-[0.65rem]">
                            <Clock className="h-2.5 w-2.5" /> {i.supervised_hours_required} h
                          </Badge>
                        )}
                        {i.already_present && (
                          <span className="text-xs text-muted-foreground">ya exigida — se actualiza</span>
                        )}
                      </span>
                      {i.reason && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">{i.reason}</span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={marcadas.size === 0 || mut.isPending}>
            Exigir {marcadas.size} competencia{marcadas.size === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NuevoRequisitoDialog({
  machineId, skills, yaExigidas, onSaved,
}: {
  machineId: string; skills: SkillRow[]; yaExigidas: string[]; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    skill_id: '', min_proficiency: '3', is_critical: true,
    requires_certification: false, supervised_hours_required: '',
  });

  const disponibles = useMemo(
    () => skills.filter((s) => !yaExigidas.includes(s.id)),
    [skills, yaExigidas]
  );

  const mut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/machines/${machineId}/competency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill_id: form.skill_id,
          min_proficiency: Number(form.min_proficiency),
          is_critical: form.is_critical,
          requires_certification: form.requires_certification,
          supervised_hours_required: form.supervised_hours_required
            ? Number(form.supervised_hours_required) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar');
      return json;
    },
    onSuccess: () => {
      toast.success('Requisito agregado.');
      setOpen(false);
      setForm({ skill_id: '', min_proficiency: '3', is_critical: true, requires_certification: false, supervised_hours_required: '' });
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <Plus className="h-4 w-4" /> Exigir competencia
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Competencia requerida</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Competencia</Label>
            <Select value={form.skill_id} onValueChange={(v) => setForm((f) => ({ ...f, skill_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Elige del catálogo" /></SelectTrigger>
              <SelectContent>
                {disponibles.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Nivel mínimo (1–5)</Label>
            <Input type="number" min={1} max={5} value={form.min_proficiency}
              onChange={(e) => setForm((f) => ({ ...f, min_proficiency: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <Label>Horas acompañado antes de operar solo</Label>
            <Input type="number" value={form.supervised_hours_required}
              onChange={(e) => setForm((f) => ({ ...f, supervised_hours_required: e.target.value }))}
              placeholder="40" />
          </div>

          <div className="flex items-center gap-2">
            <Switch id="critica" checked={form.is_critical}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_critical: v }))} />
            <Label htmlFor="critica" className="cursor-pointer text-sm">
              Crítica — sin esto no puede operar la máquina
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="cert" checked={form.requires_certification}
              onCheckedChange={(v) => setForm((f) => ({ ...f, requires_certification: v }))} />
            <Label htmlFor="cert" className="cursor-pointer text-sm">
              Exige certificación firmada
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!form.skill_id || mut.isPending}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NuevoPasoDialog({
  machineId, skills, siguienteOrden, onSaved,
}: {
  machineId: string; skills: SkillRow[]; siguienteOrden: number; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', skill_id: '', target_proficiency: '', estimated_hours: '',
  });

  const mut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/machines/${machineId}/training-path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step_order: siguienteOrden,
          title: form.title,
          description: form.description || null,
          skill_id: form.skill_id || null,
          target_proficiency: form.target_proficiency ? Number(form.target_proficiency) : null,
          estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar el paso');
      return json;
    },
    onSuccess: () => {
      toast.success('Paso agregado a la ruta.');
      setOpen(false);
      setForm({ title: '', description: '', skill_id: '', target_proficiency: '', estimated_hours: '' });
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <Plus className="h-4 w-4" /> Agregar paso
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Paso {siguienteOrden} de la ruta</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Preparar la olla de cola y controlar temperatura" />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Input value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Competencia que avanza</Label>
            <Select value={form.skill_id} onValueChange={(v) => setForm((f) => ({ ...f, skill_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
              <SelectContent>
                {skills.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nivel objetivo</Label>
              <Input type="number" min={1} max={5} value={form.target_proficiency}
                onChange={(e) => setForm((f) => ({ ...f, target_proficiency: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Horas estimadas</Label>
              <Input type="number" value={form.estimated_hours}
                onChange={(e) => setForm((f) => ({ ...f, estimated_hours: e.target.value }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={form.title.trim().length < 3 || mut.isPending}>
            Guardar paso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
