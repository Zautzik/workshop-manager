'use client';

/**
 * PautasPanel — crear y editar pautas de mantenimiento.
 *
 * POST /api/maintenance/schedules existía desde julio, completo y validado
 * (exige al menos una frecuencia, por días o por uso), y nada en la app lo
 * llamaba jamás. Esto es ese formulario: elegir la máquina ya dice en qué
 * unidad se mide su uso (impresiones, horas, km, ciclos — ver
 * machine-usage-unit.ts), así que la pauta no obliga a nadie a convertir nada.
 *
 * El checklist es opcional al crear (una pauta puede existir antes de decidir
 * el detalle) pero sin él "Vencimientos" no puede ofrecer "Crear orden" — el
 * formulario lo deja claro en vez de fallar en silencio más adelante.
 */

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil, Gauge, CalendarClock, ClipboardList, ChevronDown, ChevronRight, Cpu } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMaintenanceSchedules, useMaintenanceChecklists, type MaintenanceScheduleRow } from '@/hooks/use-maintenance-queries';
import { usageUnitInline } from '@/types/machine-usage-unit';

const MAINTENANCE_TYPES = [
  { value: 'preventive', label: 'Preventivo' },
  { value: 'corrective', label: 'Correctivo' },
  { value: 'emergency', label: 'Emergencia' },
  { value: 'inspection', label: 'Inspección' },
  { value: 'cleaning', label: 'Limpieza' },
];

interface MachineOption {
  id: string;
  name: string;
  type: string;
  usage_unit: string;
}

interface SystemOption {
  id: string;
  name: string;
  code: string;
}

function useMachinesList() {
  return useQuery<MachineOption[]>({
    queryKey: ['maintenance', 'machines-for-pautas'],
    queryFn: async () => {
      const res = await fetch('/api/machines', { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });
}

function useSystemsForMachineType(machineType?: string) {
  return useQuery<SystemOption[]>({
    queryKey: ['maintenance', 'systems-for-pautas', machineType ?? null],
    queryFn: async () => {
      const params = machineType ? `?machine_type=${encodeURIComponent(machineType)}` : '';
      const res = await fetch(`/api/machine-systems${params}`, { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: Boolean(machineType),
  });
}

interface PautaDraft {
  id?: string;
  machine_id: string;
  maintenance_type: string;
  description: string;
  frequency_days: string;
  frequency_usage: string;
  system_id: string;
  checklist_id: string;
  estimated_duration_hours: string;
}

const emptyDraft = (): PautaDraft => ({
  machine_id: '',
  maintenance_type: 'preventive',
  description: '',
  frequency_days: '',
  frequency_usage: '',
  system_id: '',
  checklist_id: '',
  estimated_duration_hours: '',
});

const toDraft = (row: MaintenanceScheduleRow): PautaDraft => ({
  id: row.id,
  machine_id: row.machine_id,
  maintenance_type: row.maintenance_type,
  description: row.description ?? '',
  frequency_days: row.frequency_days ? String(row.frequency_days) : '',
  frequency_usage: row.frequency_usage ? String(row.frequency_usage) : '',
  system_id: row.system_id ?? '',
  checklist_id: row.checklist_id ?? '',
  estimated_duration_hours: row.estimated_duration_hours ? String(row.estimated_duration_hours) : '',
});

function PautaDialog({
  open,
  onClose,
  draft,
}: {
  open: boolean;
  onClose: () => void;
  draft: PautaDraft;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [d, setD] = useState<PautaDraft>(draft);
  const { data: machines = [] } = useMachinesList();
  const { data: checklists = [] } = useMaintenanceChecklists();
  const selectedMachine = machines.find((m) => m.id === d.machine_id);
  const { data: systems = [] } = useSystemsForMachineType(selectedMachine?.type);

  // Reinicia el borrador cada vez que el diálogo se abre — sin esto, cerrar y
  // volver a abrir con otra fila mostraría el formulario de la anterior hasta
  // el próximo render por otra causa.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setD(draft); }, [open, draft]);

  const availableChecklists = (checklists as any[]).filter((c) => {
    if (!selectedMachine) return false;
    if (c.machine_id) return c.machine_id === selectedMachine.id;
    return !c.machine_type || c.machine_type === selectedMachine.type;
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!d.machine_id) throw new Error('Elige una máquina');
      if (!d.frequency_days && !d.frequency_usage) {
        throw new Error('La pauta necesita una frecuencia: por días, por uso, o ambas');
      }
      const res = await fetch('/api/maintenance/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: d.id,
          machine_id: d.machine_id,
          maintenance_type: d.maintenance_type,
          description: d.description || null,
          frequency_days: d.frequency_days ? Number(d.frequency_days) : undefined,
          frequency_usage: d.frequency_usage ? Number(d.frequency_usage) : null,
          system_id: d.system_id || null,
          checklist_id: d.checklist_id || null,
          estimated_duration_hours: d.estimated_duration_hours ? Number(d.estimated_duration_hours) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar la pauta');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance', 'schedules'] });
      toast({ title: d.id ? 'Pauta actualizada' : 'Pauta creada' });
      onClose();
    },
    onError: (e: Error) => toast({ title: 'No se pudo guardar', description: e.message, variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{d.id ? 'Editar pauta' : 'Nueva pauta de mantenimiento'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Máquina</Label>
            <Select value={d.machine_id} onValueChange={(v) => setD((x) => ({ ...x, machine_id: v, system_id: '', checklist_id: '' }))}>
              <SelectTrigger><SelectValue placeholder="Selecciona una máquina…" /></SelectTrigger>
              <SelectContent>
                {machines.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={d.maintenance_type} onValueChange={(v) => setD((x) => ({ ...x, maintenance_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MAINTENANCE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sistema (opcional)</Label>
              <Select value={d.system_id || '__none'} onValueChange={(v) => setD((x) => ({ ...x, system_id: v === '__none' ? '' : v }))} disabled={!selectedMachine}>
                <SelectTrigger><SelectValue placeholder="Sin sistema específico" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sin sistema específico</SelectItem>
                  {systems.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* La flexibilidad que pide el taller: una, la otra, o las dos --
              vence lo que ocurra primero (evaluateSchedule, maintenance-due.ts). */}
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 p-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs"><CalendarClock className="h-3.5 w-3.5" />Cada cuántos días</Label>
              <Input
                type="number" min={0} placeholder="Ej: 30"
                value={d.frequency_days}
                onChange={(e) => setD((x) => ({ ...x, frequency_days: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs">
                <Gauge className="h-3.5 w-3.5" />
                Cada cuántas {selectedMachine ? usageUnitInline(selectedMachine.usage_unit) : 'unidades de uso'}
              </Label>
              <Input
                type="number" min={0} placeholder="Ej: 500000"
                value={d.frequency_usage}
                onChange={(e) => setD((x) => ({ ...x, frequency_usage: e.target.value }))}
                disabled={!selectedMachine}
              />
            </div>
            <p className="col-span-2 text-[11px] text-muted-foreground">
              Al menos una de las dos. Con las dos cargadas, vence la que ocurra primero.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" />
              Checklist (qué hacer cuando venza)
            </Label>
            <Select value={d.checklist_id || '__none'} onValueChange={(v) => setD((x) => ({ ...x, checklist_id: v === '__none' ? '' : v }))} disabled={!selectedMachine}>
              <SelectTrigger><SelectValue placeholder="Sin checklist todavía" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sin checklist todavía</SelectItem>
                {availableChecklists.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!d.checklist_id && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Sin checklist, "Vencimientos" no podrá ofrecer "Crear orden" para esta pauta.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Duración estimada (hrs)</Label>
              <Input
                type="number" min={0} step="0.5" placeholder="2"
                value={d.estimated_duration_hours}
                onChange={(e) => setD((x) => ({ ...x, estimated_duration_hours: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea
              value={d.description}
              onChange={(e) => setD((x) => ({ ...x, description: e.target.value }))}
              placeholder="Ej: Lubricar puntos críticos, revisar rodillos…"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !d.machine_id}>
            {save.isPending ? 'Guardando…' : d.id ? 'Guardar cambios' : 'Crear pauta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface MachineGroup {
  machineId: string;
  machineName: string;
  rows: MaintenanceScheduleRow[];
  needsAttention: boolean;
}

function groupByMachine(schedules: MaintenanceScheduleRow[]): MachineGroup[] {
  const map = new Map<string, MachineGroup>();
  for (const row of schedules) {
    const key = row.machine_id;
    const existing = map.get(key);
    const attention = row.due.status === 'vencida' || row.due.status === 'proxima' || !row.checklist_id;
    if (existing) {
      existing.rows.push(row);
      existing.needsAttention = existing.needsAttention || attention;
    } else {
      map.set(key, { machineId: key, machineName: row.machine_name ?? 'Sin máquina', rows: [row], needsAttention: attention });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.machineName.localeCompare(b.machineName));
}

function PautaRow({ row, onEdit }: { row: MaintenanceScheduleRow; onEdit: (row: MaintenanceScheduleRow) => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-3 pl-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-xs">{row.maintenance_type}</Badge>
          {row.checklist_name ? (
            <Badge variant="outline" className="text-xs">{row.checklist_name}</Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-500/30">sin checklist</Badge>
          )}
        </div>
        {row.description && <p className="mt-0.5 text-sm text-muted-foreground">{row.description}</p>}
        <p className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {row.frequency_days ? <span>cada {row.frequency_days} días</span> : null}
          {row.frequency_usage ? (
            <span className="inline-flex items-center gap-1">
              <Gauge className="h-3 w-3" />
              cada {row.frequency_usage.toLocaleString('es-CL')} {row.usage_unit}
            </span>
          ) : null}
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={() => onEdit(row)}>
        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
      </Button>
    </li>
  );
}

function MachineSection({
  group,
  defaultOpen,
  onEdit,
  onNewFor,
}: {
  group: MachineGroup;
  defaultOpen: boolean;
  onEdit: (row: MaintenanceScheduleRow) => void;
  onNewFor: (machineId: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 bg-muted/20 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{group.machineName}</span>
          {group.needsAttention && <Badge variant="outline" className="border-amber-500/30 text-amber-600 text-[10px]">necesita atención</Badge>}
        </span>
        <span className="text-xs text-muted-foreground">{group.rows.length} pauta{group.rows.length === 1 ? '' : 's'}</span>
      </button>
      {open && (
        <ul className="divide-y">
          {group.rows.map((row) => <PautaRow key={row.id} row={row} onEdit={onEdit} />)}
          <li className="p-2">
            <Button variant="ghost" size="sm" className="w-full text-muted-foreground hover:text-foreground" onClick={() => onNewFor(group.machineId)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Nueva pauta para {group.machineName}
            </Button>
          </li>
        </ul>
      )}
    </div>
  );
}

export function PautasPanel() {
  const { data, isLoading } = useMaintenanceSchedules();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<PautaDraft>(emptyDraft());

  const openNew = () => { setDraft(emptyDraft()); setDialogOpen(true); };
  const openNewFor = (machineId: string) => { setDraft({ ...emptyDraft(), machine_id: machineId }); setDialogOpen(true); };
  const openEdit = (row: MaintenanceScheduleRow) => { setDraft(toDraft(row)); setDialogOpen(true); };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const schedules = data?.schedules ?? [];
  const groups = groupByMachine(schedules);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Pautas de mantenimiento</CardTitle>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1.5 h-4 w-4" /> Nueva pauta
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {groups.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No hay pautas cargadas. Crea la primera con el botón de arriba.
          </p>
        ) : (
          groups.map((group) => (
            <MachineSection
              key={group.machineId}
              group={group}
              defaultOpen={group.needsAttention}
              onEdit={openEdit}
              onNewFor={openNewFor}
            />
          ))
        )}
      </CardContent>

      <PautaDialog open={dialogOpen} onClose={() => setDialogOpen(false)} draft={draft} />
    </Card>
  );
}

export default PautasPanel;
