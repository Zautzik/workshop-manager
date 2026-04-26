'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useMachines,
  useDeleteMachine,
  useUpdateMachineStatus,
  MACHINE_TYPE_LABELS,
  MACHINE_STATUS_LABELS,
  MACHINE_STATUS_COLOR,
  type Machine,
  type MachineStatus,
  type MachineType,
} from '@/hooks/use-machines';
import { MachineProfileEditor } from './MachineProfileEditor';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Cpu,
  Zap,
  MapPin,
  Activity,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS: { value: MachineStatus; label: string }[] = [
  { value: 'idle',        label: 'En espera' },
  { value: 'running',     label: 'En operación' },
  { value: 'setup',       label: 'En preparación' },
  { value: 'maintenance', label: 'En mantenimiento' },
  { value: 'breakdown',   label: 'Avería' },
  { value: 'offline',     label: 'Fuera de servicio' },
];

export function MachineManagementPanel() {
  const { data: machines = [], isLoading } = useMachines();
  const deleteMachine = useDeleteMachine();
  const updateStatus = useUpdateMachineStatus();

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const [editTarget, setEditTarget] = useState<Machine | null | 'new'>('new' as any);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Machine | null>(null);

  const filtered = machines.filter(m => {
    const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase()) || (m.brand ?? '').toLowerCase().includes(search.toLowerCase()) || (m.model ?? '').toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || m.type === filterType;
    const matchStatus = filterStatus === 'all' || m.status === filterStatus;
    return matchSearch && matchType && matchStatus;
  });

  const openCreate = () => { setEditTarget(null); setDialogOpen(true); };
  const openEdit   = (m: Machine) => { setEditTarget(m); setDialogOpen(true); };

  const handleStatusChange = async (machine: Machine, status: MachineStatus) => {
    await updateStatus.mutateAsync({ id: machine.id, status });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-1 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar máquina…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {Object.entries(MACHINE_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={openCreate} className="gap-1 shrink-0">
          <Plus className="h-4 w-4" />Nueva máquina
        </Button>
      </div>

      {/* Summary bar */}
      <div className="flex gap-3 flex-wrap text-sm">
        {(['idle','running','maintenance','breakdown'] as MachineStatus[]).map(s => {
          const count = machines.filter(m => m.status === s).length;
          if (!count) return null;
          return (
            <div key={s} className={cn('flex items-center gap-1.5 px-3 py-1 rounded-full text-white text-xs font-medium', MACHINE_STATUS_COLOR[s])}>
              <Activity className="h-3 w-3" />{MACHINE_STATUS_LABELS[s]}: {count}
            </div>
          );
        })}
        <span className="text-muted-foreground text-xs ml-auto self-center">{filtered.length} / {machines.length} máquinas</span>
      </div>

      {/* Machine cards grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Cpu className="h-10 w-10 mx-auto mb-3 opacity-30" />
          {machines.length === 0 ? (
            <><p className="font-medium">No hay máquinas registradas.</p><p className="text-sm mt-1">Crea la primera máquina para empezar.</p></>
          ) : (
            <p>No se encontraron máquinas con los filtros actuales.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(machine => (
            <MachineCard
              key={machine.id}
              machine={machine}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}

      {/* Edit / Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              {editTarget ? `Editar — ${(editTarget as Machine).name}` : 'Nueva máquina'}
            </DialogTitle>
          </DialogHeader>
          <MachineProfileEditor
            machine={editTarget as Machine | null}
            onSaved={() => setDialogOpen(false)}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar máquina?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará <strong>{deleteTarget?.name}</strong> y desvincularé todos sus insumos y registros de costos. Los datos históricos de OTs relacionados se conservarán pero ya no estarán vinculados a esta máquina.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleteTarget) {
                  await deleteMachine.mutateAsync(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Machine Card ─────────────────────────────────────────────────────────────

function MachineCard({
  machine,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  machine: Machine;
  onEdit: (m: Machine) => void;
  onDelete: (m: Machine) => void;
  onStatusChange: (m: Machine, s: MachineStatus) => void;
}) {
  const statusDot = MACHINE_STATUS_COLOR[machine.status];

  return (
    <Card className={cn('relative overflow-hidden transition-shadow hover:shadow-md', !machine.is_active && 'opacity-60')}>
      {/* Status stripe */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-1', statusDot)} />

      <CardHeader className="pl-4 pb-2 pt-3 pr-3 flex-row items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{machine.name}</p>
          <p className="text-xs text-muted-foreground">{machine.brand} {machine.model}</p>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(machine)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(machine)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pl-4 pb-3 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="text-xs">{MACHINE_TYPE_LABELS[machine.type]}</Badge>
          {machine.colors && machine.colors > 1 && (
            <Badge variant="outline" className="text-xs">{machine.colors} colores</Badge>
          )}
          {machine.year_manufactured && (
            <Badge variant="outline" className="text-xs">{machine.year_manufactured}</Badge>
          )}
        </div>

        {machine.location && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            {machine.location}
          </div>
        )}

        {(machine.nominal_speed_sheets_hr || machine.power_kw) && (
          <div className="flex gap-3 text-xs">
            {machine.nominal_speed_sheets_hr && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Activity className="h-3 w-3" />{machine.nominal_speed_sheets_hr.toLocaleString()} h/hr
              </span>
            )}
            {machine.power_kw && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Zap className="h-3 w-3 text-amber-500" />{machine.power_kw} kW
              </span>
            )}
          </div>
        )}

        {/* Quick status switcher */}
        <div className="pt-1">
          <Select value={machine.status} onValueChange={v => onStatusChange(machine, v as MachineStatus)}>
            <SelectTrigger className={cn('h-7 text-xs border-0 focus:ring-0 text-white font-medium gap-1', statusDot, 'bg-opacity-80 hover:bg-opacity-100')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(s => (
                <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
