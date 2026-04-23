'use client';

/**
 * MaintenanceSlotSuggester
 *
 * Smart slot-finder: given a free-time budget (in minutes) and the
 * current week's task state, it scores every pending task and returns
 * a greedy-optimal list the operator can complete right now.
 *
 * Scoring model (higher = more urgent):
 *   Base frequency urgency   → daily 100 | weekly 80 | biweekly 60 |
 *                               monthly 40 | quarterly 30 | semi 20 | annual 10
 *   Not done this week       → +50
 *   Quick win (≤ 15 min)     → +20
 *   Fits budget exactly      → +10
 *
 * Selection: greedy fill by descending score until time budget is used.
 */

import { useMemo, useState } from 'react';
import { Zap, Clock, CheckCircle2, ChevronDown, ChevronUp, Wrench } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// ─── types ───────────────────────────────────────────────────────────────────

interface ProgramTask {
  id: string;
  task_number?: number;
  section?: string;
  description: string;
  frequency: string;
  action_type: string;
  estimated_minutes?: number;
}

interface Props {
  tasks: ProgramTask[];
  completedSet: Set<string>;   // "taskId-dayIndex" keys
  programName?: string;
}

// ─── constants ───────────────────────────────────────────────────────────────

const FREQUENCY_URGENCY: Record<string, number> = {
  daily: 100,
  weekly: 80,
  biweekly: 60,
  monthly: 40,
  quarterly: 30,
  semiannual: 20,
  annual: 10,
};

const FREQUENCY_LABEL: Record<string, string> = {
  daily: 'Diario',
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
};

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

const TIME_PRESETS = [15, 30, 45, 60, 90];

// ─── scoring ─────────────────────────────────────────────────────────────────

function isTaskDone(taskId: string, completedSet: Set<string>): boolean {
  for (let d = 0; d < 7; d++) {
    if (completedSet.has(`${taskId}-${d}`)) return true;
  }
  return false;
}

interface ScoredTask extends ProgramTask {
  score: number;
  isDone: boolean;
  isQuickWin: boolean;
  reasons: string[];
}

function scoreTasks(tasks: ProgramTask[], completedSet: Set<string>, budgetMinutes: number): ScoredTask[] {
  return tasks.map((t) => {
    const isDone = isTaskDone(t.id, completedSet);
    const mins = t.estimated_minutes ?? 15;
    const isQuickWin = mins <= 15;
    const reasons: string[] = [];

    let score = FREQUENCY_URGENCY[t.frequency] ?? 10;

    if (!isDone) {
      score += 50;
      reasons.push('Pendiente esta semana');
    } else {
      reasons.push('Ya completada');
    }

    if (isQuickWin) {
      score += 20;
      reasons.push('Tarea rápida');
    }

    if (mins <= budgetMinutes) {
      score += 10;
    }

    if (isDone) score = 0; // push done tasks to the bottom

    return { ...t, score, isDone, isQuickWin, reasons };
  });
}

function greedyFill(scored: ScoredTask[], budgetMinutes: number): ScoredTask[] {
  const pending = scored
    .filter((t) => !t.isDone)
    .sort((a, b) => b.score - a.score);

  const selected: ScoredTask[] = [];
  let remaining = budgetMinutes;

  for (const task of pending) {
    const mins = task.estimated_minutes ?? 15;
    if (mins <= remaining) {
      selected.push(task);
      remaining -= mins;
    }
    if (remaining <= 0) break;
  }

  return selected;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function MaintenanceSlotSuggester({ tasks, completedSet, programName }: Props) {
  const [open, setOpen] = useState(false);
  const [budget, setBudget] = useState(30);

  const pendingCount = useMemo(
    () => tasks.filter((t) => !isTaskDone(t.id, completedSet)).length,
    [tasks, completedSet],
  );

  const suggestions = useMemo(() => {
    const scored = scoreTasks(tasks, completedSet, budget);
    return greedyFill(scored, budget);
  }, [tasks, completedSet, budget]);

  const totalSuggestedMinutes = useMemo(
    () => suggestions.reduce((sum, t) => sum + (t.estimated_minutes ?? 15), 0),
    [suggestions],
  );

  if (!tasks.length) return null;

  return (
    <div className="print:hidden">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`
          w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left
          ${open
            ? 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-400'
            : 'bg-muted/40 border-border hover:border-amber-500/40 hover:bg-amber-500/5 text-muted-foreground hover:text-foreground'
          }
        `}
      >
        <Zap className={`h-4 w-4 flex-shrink-0 ${open ? 'fill-amber-400 text-amber-500' : ''}`} />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">Sugerencias inteligentes de mantenimiento</span>
          <span className="text-xs ml-2 opacity-70">
            {pendingCount} tarea{pendingCount !== 1 ? 's' : ''} pendiente{pendingCount !== 1 ? 's' : ''}
          </span>
        </div>
        <span className="text-xs opacity-60 mr-1">¿Tiempo libre? Aprovéchalo</span>
        {open ? <ChevronUp className="h-4 w-4 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 flex-shrink-0" />}
      </button>

      {/* Expanded panel */}
      {open && (
        <Card className="mt-2 border-amber-500/20 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wrench className="h-4 w-4 text-amber-500" />
              ¿Cuánto tiempo tienes disponible?
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Mientras esperas aprobaciones o llegada de material, completa estas tareas de mantenimiento.
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Time budget selector */}
            <div className="flex flex-wrap gap-2">
              {TIME_PRESETS.map((min) => (
                <button
                  key={min}
                  onClick={() => setBudget(min)}
                  className={`
                    px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                    ${budget === min
                      ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                      : 'border-border bg-background hover:border-amber-400 hover:bg-amber-500/10'
                    }
                  `}
                >
                  {min} min
                </button>
              ))}
              {/* Custom input */}
              <div className="flex items-center gap-1.5 border border-border rounded-full px-3 py-1 bg-background">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <input
                  type="number"
                  min={5}
                  max={480}
                  value={budget}
                  onChange={(e) => setBudget(Math.max(5, parseInt(e.target.value) || 5))}
                  className="w-12 text-xs bg-transparent outline-none text-center"
                />
                <span className="text-xs text-muted-foreground">min</span>
              </div>
            </div>

            {/* Results */}
            {suggestions.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500/50" />
                <p className="text-sm">
                  {pendingCount === 0
                    ? '¡Todo al día! No quedan tareas pendientes esta semana.'
                    : `Las tareas pendientes requieren más de ${budget} min. Aumenta el tiempo disponible.`}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/50 pb-2">
                  <span>
                    <span className="font-semibold text-foreground">{suggestions.length}</span> tarea{suggestions.length !== 1 ? 's' : ''} sugerida{suggestions.length !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    ~{totalSuggestedMinutes} min en total
                    <span className="text-muted-foreground/50 ml-1">({budget - totalSuggestedMinutes} min libres)</span>
                  </span>
                </div>

                <div className="space-y-2">
                  {suggestions.map((task, idx) => (
                    <div
                      key={task.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-background border border-border/50 hover:border-amber-400/40 transition-colors"
                    >
                      {/* Priority indicator */}
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 text-amber-600 flex items-center justify-center text-xs font-bold mt-0.5">
                        {idx + 1}
                      </div>

                      {/* Task info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-snug">{task.description}</p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {task.isQuickWin && (
                              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-400/30 whitespace-nowrap">
                                ⚡ Rápida
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className={`text-xs whitespace-nowrap ${ACTION_COLORS[task.action_type] ?? ACTION_COLORS.other}`}
                            >
                              {ACTION_LABEL[task.action_type] ?? task.action_type}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                          {task.section && (
                            <span className="text-xs text-muted-foreground">{task.section}</span>
                          )}
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <Clock className="h-3 w-3" />
                            ~{task.estimated_minutes ?? 15} min
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {FREQUENCY_LABEL[task.frequency] ?? task.frequency}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-muted-foreground/60 text-center pt-1">
                  Prioridad calculada por frecuencia, estado semanal y duración estimada.
                  Marca las tareas completadas en el registro semanal de arriba.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
