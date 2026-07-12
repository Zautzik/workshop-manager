'use client';

import { useEffect, useState } from 'react';
import { Book, ChevronDown, ChevronRight, Clock, Layers, Pencil, Plus, Settings2, Trash2, X } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCreateProgram, useCreateTask, useDeleteProgram, useDeleteTask, useMaintenancePrograms, useProgramTasks, useUpdateProgram, useUpdateTask } from '@/hooks/use-maintenance-queries';

const FREQUENCY_ORDER = ['daily','weekly','biweekly','monthly','quarterly','semiannual','annual'];
const FREQUENCY_META: Record<string, { label: string; color: string }> = {
  daily:      { label: 'Diario',     color: 'bg-red-500/15 text-red-600 border-red-500/30' },
  weekly:     { label: 'Semanal',    color: 'bg-sky-500/15 text-sky-600 border-sky-500/30' },
  biweekly:   { label: 'Quincenal',  color: 'bg-cyan-500/15 text-cyan-600 border-cyan-500/30' },
  monthly:    { label: 'Mensual',    color: 'bg-violet-500/15 text-violet-600 border-violet-500/30' },
  quarterly:  { label: 'Trimestral', color: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
  semiannual: { label: 'Semestral',  color: 'bg-orange-500/15 text-orange-600 border-orange-500/30' },
  annual:     { label: 'Anual',      color: 'bg-rose-500/15 text-rose-600 border-rose-500/30' },
};
const ACTION_META: Record<string, { label: string; color: string }> = {
  clean:     { label: 'Limpieza',    color: 'bg-sky-500/10 text-sky-600' },
  lubricate: { label: 'Lubricacion', color: 'bg-amber-500/10 text-amber-600' },
  check:     { label: 'Verificar',   color: 'bg-violet-500/10 text-violet-600' },
  replace:   { label: 'Reemplazar',  color: 'bg-rose-500/10 text-rose-600' },
  adjust:    { label: 'Ajuste',      color: 'bg-orange-500/10 text-orange-600' },
  inspect:   { label: 'Inspeccion',  color: 'bg-indigo-500/10 text-indigo-600' },
  service:   { label: 'Servicio',    color: 'bg-pink-500/10 text-pink-600' },
  fill:      { label: 'Rellenar',    color: 'bg-teal-500/10 text-teal-600' },
  other:     { label: 'Otro',        color: 'bg-muted text-muted-foreground' },
};
const FREQUENCY_OPTIONS = FREQUENCY_ORDER.map((k) => ({ value: k, label: FREQUENCY_META[k]?.label ?? k }));
const ACTION_OPTIONS = Object.entries(ACTION_META).map(([k, v]) => ({ value: k, label: v.label }));
const LANGUAGE_OPTIONS = [
  { value: 'es', label: 'ES Espanol' },
  { value: 'de', label: 'DE Aleman' },
  { value: 'ja', label: 'JA Japones' },
  { value: 'en', label: 'EN Ingles' },
];

interface TaskDraft { id?: string; description: string; section: string; subsection: string; frequency: string; action_type: string; estimated_minutes: number | ''; task_number: number | ''; }
const makeEmpty = (section = '', frequency = 'weekly'): TaskDraft => ({ description: '', section, subsection: '', frequency, action_type: 'clean', estimated_minutes: '', task_number: '' });
const toD = (t: any): TaskDraft => ({ id: t.id, description: t.description ?? '', section: t.section ?? '', subsection: t.subsection ?? '', frequency: t.frequency ?? 'weekly', action_type: t.action_type ?? 'clean', estimated_minutes: t.estimated_minutes ?? '', task_number: t.task_number ?? '' });

function EditTaskDialog({ open, onClose, task, programId, defaultSection = '', defaultFrequency = 'weekly' }: { open: boolean; onClose: () => void; task: any; programId: string; defaultSection?: string; defaultFrequency?: string; }) {
  const isNew = !task?.id;
  const upd = useUpdateTask(); const crt = useCreateTask();
  const [d, setD] = useState<TaskDraft>(() => task?.id ? toD(task) : makeEmpty(defaultSection, defaultFrequency));
  useEffect(() => { if (open) setD(task?.id ? toD(task) : makeEmpty(defaultSection, defaultFrequency)); }, [open, task?.id]); // eslint-disable-line
  const save = async () => {
    if (!d.description.trim()) return;
    const p = { description: d.description.trim(), section: d.section.trim() || null, subsection: d.subsection.trim() || null, frequency: d.frequency, action_type: d.action_type, estimated_minutes: d.estimated_minutes === '' ? null : Number(d.estimated_minutes), task_number: d.task_number === '' ? null : Number(d.task_number) };
    if (isNew) await crt.mutateAsync({ program_id: programId, ...p, source: 'manual' });
    else await upd.mutateAsync({ id: d.id!, programId, ...p });
    onClose();
  };
  const busy = upd.isPending || crt.isPending;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{isNew ? 'Agregar tarea' : 'Editar tarea'}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5"><Label>Descripcion</Label>
            <textarea className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" value={d.description} onChange={(e) => setD((x) => ({ ...x, description: e.target.value }))} placeholder="Descripcion de la tarea..." /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Frecuencia</Label>
              <Select value={d.frequency} onValueChange={(v) => setD((x) => ({ ...x, frequency: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FREQUENCY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Tipo de accion</Label>
              <Select value={d.action_type} onValueChange={(v) => setD((x) => ({ ...x, action_type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ACTION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Seccion</Label><Input value={d.section} onChange={(e) => setD((x) => ({ ...x, section: e.target.value }))} placeholder="Ej: Alimentador" /></div>
            <div className="space-y-1.5"><Label>Subseccion</Label><Input value={d.subsection} onChange={(e) => setD((x) => ({ ...x, subsection: e.target.value }))} placeholder="Ej: Cabezal" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Tiempo (min)</Label><Input type="number" min={1} value={d.estimated_minutes} onChange={(e) => setD((x) => ({ ...x, estimated_minutes: e.target.value === '' ? '' : Number(e.target.value) }))} placeholder="15" /></div>
            <div className="space-y-1.5"><Label>No. tarea</Label><Input type="number" min={1} value={d.task_number} onChange={(e) => setD((x) => ({ ...x, task_number: e.target.value === '' ? '' : Number(e.target.value) }))} placeholder="1" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={save} disabled={busy || !d.description.trim()}>{busy ? 'Guardando...' : isNew ? 'Agregar' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewProgramDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void; }) {
  const crt = useCreateProgram();
  const [d, setD] = useState({ name: '', machine_model: '', source_language: 'es', description: '' });
  useEffect(() => { if (open) setD({ name: '', machine_model: '', source_language: 'es', description: '' }); }, [open]);
  const save = async () => {
    if (!d.name.trim() || !d.machine_model.trim()) return;
    const r = await crt.mutateAsync({ name: d.name.trim(), machine_model: d.machine_model.trim(), source_language: d.source_language, description: d.description.trim() || undefined });
    onCreated(r.id); onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Agregar maquina / programa</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5"><Label>Nombre del programa</Label><Input value={d.name} onChange={(e) => setD((x) => ({ ...x, name: e.target.value }))} placeholder="Ej: Roland - Programa Preventivo" /></div>
          <div className="space-y-1.5"><Label>Modelo de maquina</Label><Input value={d.machine_model} onChange={(e) => setD((x) => ({ ...x, machine_model: e.target.value }))} placeholder="Ej: Roland 300, Ryobi 524GS..." /></div>
          <div className="space-y-1.5"><Label>Idioma del manual</Label>
            <Select value={d.source_language} onValueChange={(v) => setD((x) => ({ ...x, source_language: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LANGUAGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Descripcion (opcional)</Label>
            <textarea className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" value={d.description} onChange={(e) => setD((x) => ({ ...x, description: e.target.value }))} placeholder="Descripcion del programa..." /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={crt.isPending}>Cancelar</Button>
          <Button onClick={save} disabled={crt.isPending || !d.name.trim() || !d.machine_model.trim()}>{crt.isPending ? 'Creando...' : 'Crear programa'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CollapsibleSection({ title, count, badgeColor, defaultOpen = false, children }: { title: string; count: number; badgeColor?: string; defaultOpen?: boolean; children: React.ReactNode; }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left">
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <span className="font-medium text-sm">{title}</span>
          {badgeColor && <Badge variant="outline" className={`text-xs ${badgeColor}`}>{title}</Badge>}
        </div>
        <span className="text-xs text-muted-foreground">{count} tareas</span>
      </button>
      {open && <div className="p-0">{children}</div>}
    </div>
  );
}

function TaskTable({ tasks, showFrequency = false, editMode = false, onEdit, onDelete }: { tasks: any[]; showFrequency?: boolean; editMode?: boolean; onEdit?: (t: any) => void; onDelete?: (id: string) => void; }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/20 border-b border-border/30">
            <th className="text-left px-4 py-2 font-medium text-muted-foreground w-10">#</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Descripcion</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">Seccion</th>
            {showFrequency && <th className="text-left px-4 py-2 font-medium text-muted-foreground">Frecuencia</th>}
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Tipo</th>
            <th className="text-right px-4 py-2 font-medium text-muted-foreground w-20">Tiempo</th>
            {editMode && <th className="text-right px-4 py-2 font-medium text-muted-foreground w-16" />}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, idx) => {
            const am = ACTION_META[task.action_type] ?? ACTION_META.other;
            const fm = FREQUENCY_META[task.frequency];
            return (
              <tr key={task.id} className={`border-b border-border/20 ${idx % 2 === 0 ? '' : 'bg-muted/10'} ${editMode ? 'hover:bg-muted/20' : ''}`}>
                <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">{task.task_number ?? '-'}</td>
                <td className="px-4 py-2.5 leading-snug">{task.description}{task.subsection && <span className="text-xs text-muted-foreground ml-1.5">- {task.subsection}</span>}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">{task.section ?? '-'}</td>
                {showFrequency && <td className="px-4 py-2.5">{fm && <Badge variant="outline" className={`text-xs ${fm.color}`}>{fm.label}</Badge>}</td>}
                <td className="px-4 py-2.5"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${am.color}`}>{am.label}</span></td>
                <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">{task.estimated_minutes ? `${task.estimated_minutes} min` : '-'}</td>
                {editMode && (
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onEdit?.(task)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => onDelete?.(task.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function MaintenanceProgramView() {
  const [selectedProgramId, setSelectedProgramId] = useState<string>('');
  const [editMode, setEditMode] = useState(false);
  const [programDraft, setProgramDraft] = useState<{ name: string; machine_model: string; source_language: string } | null>(null);
  const [showNewProgram, setShowNewProgram] = useState(false);
  const [showDeleteProgram, setShowDeleteProgram] = useState(false);
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [editingTaskSection, setEditingTaskSection] = useState('');
  const [editingTaskFreq, setEditingTaskFreq] = useState('weekly');
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  const updateProg = useUpdateProgram(); const deleteProg = useDeleteProgram(); const deleteTask = useDeleteTask();
  const { data: programs = [], isLoading: loadingPrograms } = useMaintenancePrograms();
  const effectiveProgramId = selectedProgramId || programs[0]?.id || '';
  const { data: tasks = [], isLoading: loadingTasks } = useProgramTasks(effectiveProgramId || null);
  const activeProgram = programs.find((p) => p.id === effectiveProgramId);

  const grouped: Record<string, any[]> = {};
  for (const t of tasks) { if (!grouped[t.frequency]) grouped[t.frequency] = []; grouped[t.frequency].push(t); }
  const bySection: Record<string, any[]> = {};
  for (const t of tasks) { const k = t.section ?? 'Sin seccion'; if (!bySection[k]) bySection[k] = []; bySection[k].push(t); }
  const weeklyMin = tasks.filter((t) => t.frequency === 'weekly' || t.frequency === 'daily').reduce((s, t) => s + (t.estimated_minutes ?? 0), 0);

  const enterEdit = () => { if (activeProgram) setProgramDraft({ name: activeProgram.name, machine_model: activeProgram.machine_model ?? '', source_language: activeProgram.source_language ?? 'es' }); setEditMode(true); };
  const cancelEdit = () => { setEditMode(false); setProgramDraft(null); };
  const saveProg = async () => { if (!programDraft || !effectiveProgramId) return; await updateProg.mutateAsync({ id: effectiveProgramId, ...programDraft }); setEditMode(false); setProgramDraft(null); };
  const delProg = async () => { await deleteProg.mutateAsync(effectiveProgramId); setSelectedProgramId(''); setShowDeleteProgram(false); setEditMode(false); setProgramDraft(null); };
  const delTask = async () => { if (!deletingTaskId || !effectiveProgramId) return; await deleteTask.mutateAsync({ id: deletingTaskId, programId: effectiveProgramId }); setDeletingTaskId(null); };
  const addTask = (s: string, f: string) => { setEditingTaskSection(s); setEditingTaskFreq(f); setEditingTask({}); };
  const editTask = (t: any) => { setEditingTaskSection(t.section ?? ''); setEditingTaskFreq(t.frequency ?? 'weekly'); setEditingTask(t); };

  if (loadingPrograms) return <div className="flex items-center justify-center h-48 text-muted-foreground">Cargando programas...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-1 min-w-0">
          {!editMode ? (
            <>
              <Select value={effectiveProgramId} onValueChange={(v) => setSelectedProgramId(v)}>
                <SelectTrigger className="max-w-sm"><SelectValue placeholder="Seleccionar programa..." /></SelectTrigger>
                <SelectContent>{programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
              {activeProgram && <Badge variant="outline" className="shrink-0">{activeProgram.machine_model}</Badge>}
            </>
          ) : programDraft && (
            <div className="flex flex-wrap gap-2 items-end flex-1">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Nombre del programa</Label>
                <Input className="w-72" value={programDraft.name} onChange={(e) => setProgramDraft((d) => d && { ...d, name: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Modelo de maquina</Label>
                <Input className="w-40" value={programDraft.machine_model} onChange={(e) => setProgramDraft((d) => d && { ...d, machine_model: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Idioma manual</Label>
                <Select value={programDraft.source_language} onValueChange={(v) => setProgramDraft((d) => d && { ...d, source_language: v })}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>{LANGUAGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!editMode ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowNewProgram(true)}><Plus className="h-4 w-4 mr-1.5" /> Agregar maquina</Button>
              {activeProgram && <Button variant="outline" size="sm" onClick={enterEdit}><Settings2 className="h-4 w-4 mr-1.5" /> Editar</Button>}
            </>
          ) : (
            <>
              <Button variant="destructive" size="sm" onClick={() => setShowDeleteProgram(true)}><Trash2 className="h-4 w-4 mr-1.5" /> Eliminar</Button>
              <Button variant="outline" size="sm" onClick={cancelEdit}><X className="h-4 w-4 mr-1.5" /> Cancelar</Button>
              <Button size="sm" onClick={saveProg} disabled={updateProg.isPending}>{updateProg.isPending ? 'Guardando...' : 'Guardar cambios'}</Button>
            </>
          )}
        </div>
      </div>

      {!programs.length && (
        <Card className="p-8 text-center">
          <Book className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-muted-foreground">No hay programas disponibles.</p>
          <p className="text-xs text-muted-foreground mt-1">Ejecute las migraciones SQL o cree una maquina con el boton de arriba.</p>
        </Card>
      )}

      {!loadingTasks && tasks.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4"><p className="text-xs text-muted-foreground">Total tareas</p><p className="text-2xl font-bold">{tasks.length}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground">Tareas semanales</p><p className="text-2xl font-bold text-sky-500">{tasks.filter((t) => t.frequency === 'weekly' || t.frequency === 'daily').length}</p></Card>
          <Card className="p-4 flex items-center gap-3"><Clock className="h-5 w-5 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Tiempo semanal</p><p className="text-lg font-bold">{weeklyMin} min</p></div></Card>
          <Card className="p-4 flex items-center gap-3"><Layers className="h-5 w-5 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Secciones</p><p className="text-lg font-bold">{Object.keys(bySection).length}</p></div></Card>
        </div>
      )}

      {loadingTasks ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground">Cargando tareas...</div>
      ) : effectiveProgramId && tasks.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Este programa no tiene tareas.</p>
          {editMode && <Button className="mt-4" variant="outline" onClick={() => addTask('', 'weekly')}><Plus className="h-4 w-4 mr-1.5" /> Agregar primera tarea</Button>}
        </Card>
      ) : effectiveProgramId ? (
        <Tabs defaultValue="by-frequency">
          <TabsList>
            <TabsTrigger value="by-frequency">Por Frecuencia</TabsTrigger>
            <TabsTrigger value="by-section">Por Seccion</TabsTrigger>
          </TabsList>
          <TabsContent value="by-frequency" className="mt-4 space-y-4">
            {FREQUENCY_ORDER.filter((f) => grouped[f]?.length).map((freq) => (
              <CollapsibleSection key={freq} title={FREQUENCY_META[freq]?.label ?? freq} badgeColor={FREQUENCY_META[freq]?.color ?? ''} count={grouped[freq].length} defaultOpen={freq === 'weekly' || freq === 'daily'}>
                <TaskTable tasks={grouped[freq]} editMode={editMode} onEdit={editTask} onDelete={(id) => setDeletingTaskId(id)} />
                {editMode && <div className="px-4 py-2 border-t border-border/20"><Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => addTask('', freq)}><Plus className="h-3.5 w-3.5 mr-1.5" /> Agregar tarea {FREQUENCY_META[freq]?.label.toLowerCase()}</Button></div>}
              </CollapsibleSection>
            ))}
            {editMode && <Button variant="outline" size="sm" className="w-full border-dashed" onClick={() => addTask('', 'weekly')}><Plus className="h-4 w-4 mr-1.5" /> Agregar tarea en otra frecuencia</Button>}
          </TabsContent>
          <TabsContent value="by-section" className="mt-4 space-y-4">
            {Object.entries(bySection).map(([section, st]) => (
              <CollapsibleSection key={section} title={section} count={st.length} defaultOpen={false}>
                <TaskTable tasks={st} showFrequency editMode={editMode} onEdit={editTask} onDelete={(id) => setDeletingTaskId(id)} />
                {editMode && <div className="px-4 py-2 border-t border-border/20"><Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => addTask(section, 'weekly')}><Plus className="h-3.5 w-3.5 mr-1.5" /> Agregar tarea a {section}</Button></div>}
              </CollapsibleSection>
            ))}
            {editMode && <Button variant="outline" size="sm" className="w-full border-dashed" onClick={() => addTask('', 'weekly')}><Plus className="h-4 w-4 mr-1.5" /> Agregar tarea en nueva seccion</Button>}
          </TabsContent>
        </Tabs>
      ) : null}

      <NewProgramDialog open={showNewProgram} onClose={() => setShowNewProgram(false)} onCreated={(id) => setSelectedProgramId(id)} />
      <EditTaskDialog open={editingTask !== null} onClose={() => setEditingTask(null)} task={editingTask && Object.keys(editingTask).length ? editingTask : null} programId={effectiveProgramId} defaultSection={editingTaskSection} defaultFrequency={editingTaskFreq} />

      <AlertDialog open={Boolean(deletingTaskId)} onOpenChange={(v) => { if (!v) setDeletingTaskId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Eliminar esta tarea?</AlertDialogTitle><AlertDialogDescription>La tarea se desactivara y dejara de aparecer. No se borra permanentemente.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={delTask}>Eliminar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteProgram} onOpenChange={setShowDeleteProgram}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Eliminar programa &quot;{activeProgram?.name}&quot;?</AlertDialogTitle><AlertDialogDescription>El programa se desactivara junto con todas sus tareas. Los datos no se borran permanentemente.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={delProg}>Eliminar programa</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
