'use client';

/**
 * WeeklyProgramLog
 *
 * Operator-facing weekly maintenance log.
 * Mirrors the Mon–Sun grid from the Japanese Ryobi manual (PDF 2)
 * but is interactive, persisted to Supabase, and adapts dynamically
 * to show only the tasks that are due in the current week.
 *
 * Frequency rules:
 *   daily / weekly  → always due, checkboxes for each day
 *   biweekly        → due on odd ISO-weeks
 *   monthly         → due when week_start falls in the first 7 days of the month
 *   quarterly       → due in Jan/Apr/Jul/Oct, first week of that month
 *   semiannual      → due in Jan/Jul, first week of those months
 *   annual          → due in January, first week
 */

import { useState, useMemo } from 'react';
import { getISOWeek, startOfWeek, addWeeks, format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Printer, RefreshCw, ClipboardList } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  useMaintenancePrograms,
  useProgramTasks,
  useWeeklyProgramLogs,
  useToggleProgramTaskLog,
} from '@/hooks/use-queries';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

// ─── helpers ────────────────────────────────────────────────────────────────

function toIsoDate(d: Date): string {
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
}

function getMondayOfWeek(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

function isTaskDueThisWeek(frequency: string, weekStart: Date): boolean {
  const month = weekStart.getMonth(); // 0-indexed
  const dayOfMonth = weekStart.getDate();
  const weekNum = getISOWeek(weekStart);
  const isFirstWeekOfMonth = dayOfMonth <= 7;

  switch (frequency) {
    case 'daily':
    case 'weekly':
      return true;
    case 'biweekly':
      return weekNum % 2 === 1; // odd ISO-week numbers
    case 'monthly':
      return isFirstWeekOfMonth;
    case 'quarterly':
      return (month === 0 || month === 3 || month === 6 || month === 9) && isFirstWeekOfMonth;
    case 'semiannual':
      return (month === 0 || month === 6) && isFirstWeekOfMonth;
    case 'annual':
      return month === 0 && isFirstWeekOfMonth;
    default:
      return true;
  }
}

const FREQUENCY_LABEL: Record<string, string> = {
  daily: 'Diario',
  weekly: 'Semanal',
  biweekly: 'Cada 2 Semanas',
  monthly: 'Cada Mes',
  quarterly: 'Cada 3 Meses',
  semiannual: 'Cada 6 Meses',
  annual: 'Anual',
};

const FREQUENCY_ORDER = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual'];

const ACTION_COLORS: Record<string, string> = {
  clean: 'bg-sky-500/15 text-sky-600 border-sky-500/30',
  lubricate: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  check: 'bg-violet-500/15 text-violet-600 border-violet-500/30',
  replace: 'bg-rose-500/15 text-rose-600 border-rose-500/30',
  adjust: 'bg-orange-500/15 text-orange-600 border-orange-500/30',
  inspect: 'bg-indigo-500/15 text-indigo-600 border-indigo-500/30',
  service: 'bg-pink-500/15 text-pink-600 border-pink-500/30',
  fill: 'bg-teal-500/15 text-teal-600 border-teal-500/30',
  other: 'bg-muted text-muted-foreground border-border',
};

const ACTION_LABEL: Record<string, string> = {
  clean: 'Limpieza',
  lubricate: 'Lubricación',
  check: 'Verificar',
  replace: 'Reemplazar',
  adjust: 'Ajuste',
  inspect: 'Inspección',
  service: 'Servicio',
  fill: 'Rellenar',
  other: 'Otro',
};

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DAY_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// ─── component ──────────────────────────────────────────────────────────────

export default function WeeklyProgramLog() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedProgramId, setSelectedProgramId] = useState<string>('');

  const weekStart = useMemo(() => {
    const monday = getMondayOfWeek(new Date());
    return addWeeks(monday, weekOffset);
  }, [weekOffset]);

  const weekStartIso = toIsoDate(weekStart);
  const weekEndIso = toIsoDate(addDays(weekStart, 6));

  const { data: programs = [], isLoading: loadingPrograms } = useMaintenancePrograms();
  const { data: tasks = [], isLoading: loadingTasks } = useProgramTasks(selectedProgramId || null);
  const { data: logs = [], isLoading: loadingLogs } = useWeeklyProgramLogs(selectedProgramId || null, weekStartIso);
  const { mutate: toggleLog, isPending: toggling } = useToggleProgramTaskLog();

  // Auto-select first program
  const effectiveProgramId = selectedProgramId || programs[0]?.id || '';

  // Build a Set of completed task+day combos: "taskId-dayIndex"
  const completedSet = useMemo(() => {
    const s = new Set<string>();
    for (const log of logs) {
      if (log.completed) s.add(`${log.task_id}-${log.day_of_week}`);
    }
    return s;
  }, [logs]);

  // Group tasks by frequency, only those due this week
  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const t of tasks) {
      const due = isTaskDueThisWeek(t.frequency, weekStart);
      if (!due) continue;
      if (!map[t.frequency]) map[t.frequency] = [];
      map[t.frequency].push(t);
    }
    return map;
  }, [tasks, weekStart]);

  // Count of non-due tasks (shown as a summary)
  const notDueCount = useMemo(() => {
    return tasks.filter((t) => !isTaskDueThisWeek(t.frequency, weekStart)).length;
  }, [tasks, weekStart]);

  const totalDue = useMemo(() => Object.values(grouped).flat().length, [grouped]);
  const totalDone = useMemo(() => {
    let done = 0;
    for (const t of Object.values(grouped).flat()) {
      for (let d = 0; d < 7; d++) {
        if (completedSet.has(`${t.id}-${d}`)) { done++; break; }
      }
    }
    return done;
  }, [grouped, completedSet]);

  function handleToggle(taskId: string, dayIndex: number) {
    const key = `${taskId}-${dayIndex}`;
    const isNowCompleted = !completedSet.has(key);
    toggleLog(
      {
        taskId,
        programId: effectiveProgramId,
        weekStart: weekStartIso,
        dayOfWeek: dayIndex,
        completed: isNowCompleted,
        completedBy: user?.id ?? null,
      },
      {
        onError: () =>
          toast({ title: 'Error', description: 'No se pudo guardar el cambio.', variant: 'destructive' }),
      },
    );
  }

  function handlePrint() {
    window.print();
  }

  const isLoading = loadingPrograms || loadingTasks || loadingLogs;

  if (loadingPrograms) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!programs.length) {
    return (
      <Card className="p-8 text-center">
        <ClipboardList className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
        <p className="text-muted-foreground">No hay programas de mantenimiento activos.</p>
        <p className="text-xs text-muted-foreground mt-1">Ejecute las migraciones SQL para cargar los programas Ryobi.</p>
      </Card>
    );
  }

  const activeProgram = programs.find((p) => p.id === effectiveProgramId);

  return (
    <div className="space-y-6 print:space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 print:hidden">
        {/* Program selector */}
        <div className="flex-1">
          <Select
            value={effectiveProgramId}
            onValueChange={(v) => setSelectedProgramId(v)}
          >
            <SelectTrigger className="max-w-sm">
              <SelectValue placeholder="Seleccionar programa…" />
            </SelectTrigger>
            <SelectContent>
              {programs.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekOffset((o) => o - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium min-w-[160px] text-center">
            {format(weekStart, 'd MMM', { locale: es })} — {format(addDays(weekStart, 6), 'd MMM yyyy', { locale: es })}
          </div>
          <Button variant="outline" size="icon" onClick={() => setWeekOffset((o) => o + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {weekOffset !== 0 && (
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)} className="text-xs">
              Hoy
            </Button>
          )}
        </div>

        <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
          <Printer className="h-4 w-4" />
          Imprimir
        </Button>
      </div>

      {/* ── Print header (visible only when printing) ── */}
      <div className="hidden print:block mb-4">
        <div className="flex justify-between items-start border-b pb-2">
          <div>
            <h1 className="text-xl font-bold">Registro Semanal Mantenimiento</h1>
            <p className="text-sm text-gray-600">{activeProgram?.name} — {activeProgram?.machine_model}</p>
          </div>
          <div className="text-right text-sm">
            <div><span className="font-medium">Semana:</span> {format(weekStart, 'd MMM', { locale: es })} – {format(addDays(weekStart, 6), 'd MMM yyyy', { locale: es })}</div>
            <div><span className="font-medium">Semana ISO:</span> {getISOWeek(weekStart)}</div>
          </div>
        </div>
      </div>

      {/* ── Progress summary ── */}
      <div className="flex items-center gap-4 print:hidden">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: totalDue ? `${(totalDone / totalDue) * 100}%` : '0%' }}
          />
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {totalDone}/{totalDue} tareas completadas
        </span>
        {notDueCount > 0 && (
          <span className="text-xs text-muted-foreground">
            ({notDueCount} no aplican esta semana)
          </span>
        )}
      </div>

      {/* ── Task grid ── */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          {FREQUENCY_ORDER.filter((freq) => grouped[freq]?.length).map((freq) => (
            <FrequencySection
              key={freq}
              frequency={freq}
              tasks={grouped[freq]}
              weekStart={weekStart}
              completedSet={completedSet}
              onToggle={handleToggle}
              toggling={toggling}
            />
          ))}

          {totalDue === 0 && (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No hay tareas programadas para esta semana.</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── FrequencySection ────────────────────────────────────────────────────────

interface FrequencySectionProps {
  frequency: string;
  tasks: any[];
  weekStart: Date;
  completedSet: Set<string>;
  onToggle: (taskId: string, dayIndex: number) => void;
  toggling: boolean;
}

function FrequencySection({ frequency, tasks, completedSet, onToggle, toggling }: FrequencySectionProps) {
  const isWeeklyOrDaily = frequency === 'weekly' || frequency === 'daily';

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-2">
          {FREQUENCY_LABEL[frequency] ?? frequency}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border/50">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-8">#</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Tarea</th>
              <th className="px-2 py-2 font-medium text-muted-foreground text-center hidden md:table-cell">Tipo</th>
              {isWeeklyOrDaily ? (
                DAY_LABELS.map((d, i) => (
                  <th key={i} className="px-2 py-2 font-medium text-muted-foreground text-center w-10" title={DAY_FULL[i]}>
                    {d}
                  </th>
                ))
              ) : (
                <th className="px-3 py-2 font-medium text-muted-foreground text-center w-24">Completado</th>
              )}
            </tr>
          </thead>
          <tbody>
            {tasks.map((task, idx) => {
              // For non-weekly tasks, "done" if any day is checked
              const anyDayDone = Array.from({ length: 7 }, (_, d) =>
                completedSet.has(`${task.id}-${d}`),
              ).some(Boolean);

              return (
                <tr
                  key={task.id}
                  className={`border-b border-border/30 transition-colors ${
                    anyDayDone ? 'bg-emerald-500/5' : idx % 2 === 0 ? '' : 'bg-muted/20'
                  }`}
                >
                  {/* Task number */}
                  <td className="px-3 py-2.5 text-muted-foreground text-xs font-mono">
                    {task.task_number ?? '—'}
                  </td>

                  {/* Description */}
                  <td className="px-3 py-2.5">
                    <div className={`font-medium leading-snug ${anyDayDone ? 'line-through text-muted-foreground' : ''}`}>
                      {task.description}
                    </div>
                    {task.section && (
                      <div className="text-xs text-muted-foreground mt-0.5">{task.section}</div>
                    )}
                    {task.estimated_minutes && (
                      <div className="text-xs text-muted-foreground/70 mt-0.5">~{task.estimated_minutes} min</div>
                    )}
                  </td>

                  {/* Action type badge */}
                  <td className="px-2 py-2.5 text-center hidden md:table-cell">
                    <Badge
                      variant="outline"
                      className={`text-xs whitespace-nowrap ${ACTION_COLORS[task.action_type] ?? ACTION_COLORS.other}`}
                    >
                      {ACTION_LABEL[task.action_type] ?? task.action_type}
                    </Badge>
                  </td>

                  {/* Checkboxes */}
                  {isWeeklyOrDaily ? (
                    Array.from({ length: 7 }, (_, dayIdx) => {
                      const key = `${task.id}-${dayIdx}`;
                      const checked = completedSet.has(key);
                      return (
                        <td key={dayIdx} className="px-2 py-2.5 text-center">
                          <button
                            onClick={() => onToggle(task.id, dayIdx)}
                            disabled={toggling}
                            aria-label={`${task.description} — ${DAY_FULL[dayIdx]}`}
                            className={`w-7 h-7 rounded border-2 transition-all flex items-center justify-center mx-auto
                              ${checked
                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                : 'border-border hover:border-emerald-400 hover:bg-emerald-500/10'
                              }
                              ${toggling ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                          >
                            {checked && (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        </td>
                      );
                    })
                  ) : (
                    /* Single "done this week" button for less-frequent tasks */
                    <td className="px-3 py-2.5 text-center" colSpan={1}>
                      <button
                        onClick={() => {
                          // Use Friday (4) as a neutral "done this period" day
                          const targetDay = 4;
                          onToggle(task.id, targetDay);
                        }}
                        disabled={toggling}
                        aria-label={`Marcar ${task.description} como completado`}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                          ${anyDayDone
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'border-border text-muted-foreground hover:border-emerald-400 hover:text-emerald-600'
                          }
                          ${toggling ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                      >
                        {anyDayDone ? (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Hecho
                          </>
                        ) : (
                          'Marcar'
                        )}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
