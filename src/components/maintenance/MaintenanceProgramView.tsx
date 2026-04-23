'use client';

/**
 * MaintenanceProgramView
 *
 * Supervisor / manager read-only view of a machine's full maintenance program.
 * Shows all tasks from both manuals, grouped by frequency, with action-type
 * colour coding and section labels.
 *
 * Used as the "reference card" — the digital equivalent of PDF 1's
 * technical matrix and PDF 2's task list combined.
 */

import { useState } from 'react';
import { Book, ChevronDown, ChevronRight, Clock, Layers } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useMaintenancePrograms, useProgramTasks } from '@/hooks/use-queries';

// ─── constants ───────────────────────────────────────────────────────────────

const FREQUENCY_ORDER = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual'];

const FREQUENCY_META: Record<string, { label: string; color: string }> = {
  daily:      { label: 'Diario',        color: 'bg-red-500/15 text-red-600 border-red-500/30' },
  weekly:     { label: 'Semanal',       color: 'bg-sky-500/15 text-sky-600 border-sky-500/30' },
  biweekly:   { label: 'Quincenal',     color: 'bg-cyan-500/15 text-cyan-600 border-cyan-500/30' },
  monthly:    { label: 'Mensual',       color: 'bg-violet-500/15 text-violet-600 border-violet-500/30' },
  quarterly:  { label: 'Trimestral',    color: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
  semiannual: { label: 'Semestral',     color: 'bg-orange-500/15 text-orange-600 border-orange-500/30' },
  annual:     { label: 'Anual',         color: 'bg-rose-500/15 text-rose-600 border-rose-500/30' },
};

const ACTION_META: Record<string, { label: string; color: string }> = {
  clean:     { label: 'Limpieza',    color: 'bg-sky-500/10 text-sky-600' },
  lubricate: { label: 'Lubricación', color: 'bg-amber-500/10 text-amber-600' },
  check:     { label: 'Verificar',   color: 'bg-violet-500/10 text-violet-600' },
  replace:   { label: 'Reemplazar',  color: 'bg-rose-500/10 text-rose-600' },
  adjust:    { label: 'Ajuste',      color: 'bg-orange-500/10 text-orange-600' },
  inspect:   { label: 'Inspección',  color: 'bg-indigo-500/10 text-indigo-600' },
  service:   { label: 'Servicio',    color: 'bg-pink-500/10 text-pink-600' },
  fill:      { label: 'Rellenar',    color: 'bg-teal-500/10 text-teal-600' },
  other:     { label: 'Otro',        color: 'bg-muted text-muted-foreground' },
};

// ─── component ───────────────────────────────────────────────────────────────

export default function MaintenanceProgramView() {
  const [selectedProgramId, setSelectedProgramId] = useState<string>('');

  const { data: programs = [], isLoading: loadingPrograms } = useMaintenancePrograms();
  const effectiveProgramId = selectedProgramId || programs[0]?.id || '';
  const { data: tasks = [], isLoading: loadingTasks } = useProgramTasks(effectiveProgramId || null);

  const activeProgram = programs.find((p) => p.id === effectiveProgramId);

  // Group tasks by frequency
  const grouped: Record<string, any[]> = {};
  for (const t of tasks) {
    if (!grouped[t.frequency]) grouped[t.frequency] = [];
    grouped[t.frequency].push(t);
  }

  // Group tasks by section (for "By section" tab)
  const bySection: Record<string, any[]> = {};
  for (const t of tasks) {
    const key = t.section ?? 'Sin sección';
    if (!bySection[key]) bySection[key] = [];
    bySection[key].push(t);
  }

  // Stats
  const totalMinutes = tasks.reduce((s, t) => s + (t.estimated_minutes ?? 0), 0);
  const weeklyMinutes = tasks
    .filter((t) => t.frequency === 'weekly' || t.frequency === 'daily')
    .reduce((s, t) => s + (t.estimated_minutes ?? 0), 0);

  if (loadingPrograms) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        Cargando programas…
      </div>
    );
  }

  if (!programs.length) {
    return (
      <Card className="p-8 text-center">
        <Book className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
        <p className="text-muted-foreground">No hay programas disponibles.</p>
        <p className="text-xs text-muted-foreground mt-1">Ejecute las migraciones SQL para cargar los programas Ryobi.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Program selector + meta */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <Select value={effectiveProgramId} onValueChange={(v) => setSelectedProgramId(v)}>
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

        {activeProgram && (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{activeProgram.machine_model}</Badge>
            <Badge variant="outline">{activeProgram.source_language === 'de' ? '🇩🇪 Roland' : activeProgram.source_language === 'ja' ? '🇯🇵 Ryobi' : activeProgram.source_language}</Badge>
            {activeProgram.manual_source && (
              <span className="flex items-center gap-1">
                <Book className="h-3 w-3" /> {activeProgram.manual_source}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Summary cards */}
      {!loadingTasks && tasks.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Total tareas</p>
            <p className="text-2xl font-bold">{tasks.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Tareas semanales</p>
            <p className="text-2xl font-bold text-sky-500">
              {tasks.filter((t) => t.frequency === 'weekly' || t.frequency === 'daily').length}
            </p>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Tiempo semanal</p>
              <p className="text-lg font-bold">{weeklyMinutes} min</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <Layers className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Secciones</p>
              <p className="text-lg font-bold">{Object.keys(bySection).length}</p>
            </div>
          </Card>
        </div>
      )}

      {/* Main content */}
      {loadingTasks ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          Cargando tareas…
        </div>
      ) : tasks.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Este programa no tiene tareas cargadas.</p>
        </Card>
      ) : (
        <Tabs defaultValue="by-frequency">
          <TabsList>
            <TabsTrigger value="by-frequency">Por Frecuencia</TabsTrigger>
            <TabsTrigger value="by-section">Por Sección</TabsTrigger>
          </TabsList>

          {/* ── By Frequency ── */}
          <TabsContent value="by-frequency" className="mt-4 space-y-4">
            {FREQUENCY_ORDER.filter((f) => grouped[f]?.length).map((freq) => (
              <CollapsibleSection
                key={freq}
                title={FREQUENCY_META[freq]?.label ?? freq}
                badgeColor={FREQUENCY_META[freq]?.color ?? ''}
                count={grouped[freq].length}
                defaultOpen={freq === 'weekly' || freq === 'daily'}
              >
                <TaskTable tasks={grouped[freq]} />
              </CollapsibleSection>
            ))}
          </TabsContent>

          {/* ── By Section ── */}
          <TabsContent value="by-section" className="mt-4 space-y-4">
            {Object.entries(bySection).map(([section, sectionTasks]) => (
              <CollapsibleSection
                key={section}
                title={section}
                count={sectionTasks.length}
                defaultOpen={false}
              >
                <TaskTable tasks={sectionTasks} showFrequency />
              </CollapsibleSection>
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ─── CollapsibleSection ──────────────────────────────────────────────────────

interface CollapsibleSectionProps {
  title: string;
  count: number;
  badgeColor?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ title, count, badgeColor, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <span className="font-medium text-sm">{title}</span>
          {badgeColor && (
            <Badge variant="outline" className={`text-xs ${badgeColor}`}>
              {title}
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{count} tareas</span>
      </button>
      {open && <div className="p-0">{children}</div>}
    </div>
  );
}

// ─── TaskTable ───────────────────────────────────────────────────────────────

function TaskTable({ tasks, showFrequency = false }: { tasks: any[]; showFrequency?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/20 border-b border-border/30">
            <th className="text-left px-4 py-2 font-medium text-muted-foreground w-10">#</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Descripción</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">Sección</th>
            {showFrequency && (
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Frecuencia</th>
            )}
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Tipo</th>
            <th className="text-right px-4 py-2 font-medium text-muted-foreground w-20">Tiempo</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, idx) => {
            const am = ACTION_META[task.action_type] ?? ACTION_META.other;
            const fm = FREQUENCY_META[task.frequency];
            return (
              <tr key={task.id} className={`border-b border-border/20 ${idx % 2 === 0 ? '' : 'bg-muted/10'}`}>
                <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">{task.task_number ?? '—'}</td>
                <td className="px-4 py-2.5 leading-snug">
                  {task.description}
                  {task.subsection && (
                    <span className="text-xs text-muted-foreground ml-1.5">· {task.subsection}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">
                  {task.section ?? '—'}
                </td>
                {showFrequency && (
                  <td className="px-4 py-2.5">
                    {fm && (
                      <Badge variant="outline" className={`text-xs ${fm.color}`}>
                        {fm.label}
                      </Badge>
                    )}
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${am.color}`}>
                    {am.label}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                  {task.estimated_minutes ? `${task.estimated_minutes} min` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
