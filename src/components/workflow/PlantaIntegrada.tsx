'use client';

/**
 * PlantaIntegrada — Live Workshop Floor View
 *
 * This is the engine where Machines + People + OTs + Inventory
 * come together on a single, live floor map.
 *
 * Data sources:
 *  - planta_live view  → workstations enriched with machine data
 *  - machines table    → individual machine profiles
 *  - worker_assignments → who is working where today
 *  - ots               → active work orders per workstation
 *  - inventory alerts  → critical supplies below minimum stock
 */

import { useState, useMemo } from 'react';
import { usePlantaLive, useMachines, MACHINE_STATUS_COLOR, MACHINE_STATUS_LABELS, MACHINE_TYPE_LABELS } from '@/hooks/use-machines';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Cpu,
  Users,
  ClipboardList,
  Package,
  AlertTriangle,
  Activity,
  Zap,
  MapPin,
  RefreshCw,
  LayoutGrid,
  List,
  ChevronRight,
  Clock,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

// ─── Priority colors ──────────────────────────────────────────────────────────
const PRIORITY_COLOR: Record<string, string> = {
  urgente: 'text-rose-600 border-rose-400 bg-rose-50',
  alta:    'text-amber-600 border-amber-400 bg-amber-50',
  normal:  'text-sky-600 border-sky-400 bg-sky-50',
  baja:    'text-slate-500 border-slate-300 bg-slate-50',
};

const OT_STATUS_COLOR: Record<string, string> = {
  en_proceso: 'bg-emerald-500',
  maquina:    'bg-blue-500',
  pendiente:  'bg-slate-400',
  pausado:    'bg-amber-500',
};

export function PlantaIntegrada() {
  const qc = useQueryClient();
  const { data: items = [], isLoading, dataUpdatedAt } = usePlantaLive();
  const { data: allMachines = [] } = useMachines(true);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [filterStatus, setFilterStatus] = useState('all');

  const lastRefresh = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—';

  const filtered = useMemo(() => {
    if (filterStatus === 'all') return items;
    return items.filter(i => (i.machine_status ?? i.workstation_status) === filterStatus);
  }, [items, filterStatus]);

  // Summary stats
  const stats = useMemo(() => ({
    running:  items.filter(i => i.machine_status === 'running' || i.workstation_status === 'active').length,
    idle:     items.filter(i => i.machine_status === 'idle'    || i.workstation_status === 'idle').length,
    maintenance: items.filter(i => i.machine_status === 'maintenance').length,
    breakdown:   items.filter(i => i.machine_status === 'breakdown').length,
    withOT:   items.filter(i => i.active_ot).length,
    alerts:   items.reduce((n: number, i: any) => n + (i.critical_supply_alerts ?? 0), 0),
    workers:  items.reduce((n: number, i: any) => n + (i.workers_today ?? 0), 0),
  }), [items]);

  // Machines without workstation (not on planta yet)
  const unassigned = allMachines.filter(m => !m.workstation_id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-60">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Cargando planta…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            Planta Integrada
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Vista en tiempo real · Actualizado: {lastRefresh}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las máquinas</SelectItem>
              <SelectItem value="running">En operación</SelectItem>
              <SelectItem value="idle">En espera</SelectItem>
              <SelectItem value="maintenance">Mantenimiento</SelectItem>
              <SelectItem value="breakdown">Avería</SelectItem>
              <SelectItem value="offline">Fuera de servicio</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex rounded-md border overflow-hidden">
            <Button variant={view === 'grid' ? 'default' : 'ghost'} size="sm" className="h-8 rounded-none px-2.5" onClick={() => setView('grid')}><LayoutGrid className="h-3.5 w-3.5" /></Button>
            <Button variant={view === 'list' ? 'default' : 'ghost'} size="sm" className="h-8 rounded-none px-2.5 border-l" onClick={() => setView('list')}><List className="h-3.5 w-3.5" /></Button>
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => qc.invalidateQueries({ queryKey: ['planta', 'live'] })}>
            <RefreshCw className="h-3 w-3" />Refrescar
          </Button>
        </div>
      </div>

      {/* ── Summary ── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <SummaryChip icon={<Activity className="h-4 w-4 text-emerald-500" />} label="Operando" value={stats.running} color="emerald" />
        <SummaryChip icon={<Circle className="h-4 w-4 text-slate-400" />} label="En espera" value={stats.idle} color="slate" />
        <SummaryChip icon={<Clock className="h-4 w-4 text-amber-500" />} label="Mantención" value={stats.maintenance} color="amber" />
        <SummaryChip icon={<ClipboardList className="h-4 w-4 text-sky-500" />} label="Con OT activa" value={stats.withOT} color="sky" />
        <SummaryChip icon={<Users className="h-4 w-4 text-violet-500" />} label="Personas hoy" value={stats.workers} color="violet" />
        <SummaryChip icon={<AlertTriangle className="h-4 w-4 text-rose-500" />} label="Alertas" value={stats.alerts} color="rose" urgent={stats.alerts > 0} />
      </div>

      {/* ── Floor Grid ── */}
      {view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(slot => (
            <PlantaSlotCard key={slot.workstation_id} slot={slot} />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              <Cpu className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No hay puestos que mostrar con los filtros actuales.</p>
            </div>
          )}
        </div>
      ) : (
        <PlantaListView slots={filtered} />
      )}

      {/* ── Unassigned machines warning ── */}
      {unassigned.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {unassigned.length} máquina(s) sin asignar a un puesto de la planta
          </p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map(m => (
              <Badge key={m.id} variant="outline" className="text-amber-700 border-amber-300 text-xs">
                {m.name}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-amber-600">Ve al módulo Máquinas y asigna cada una a un puesto de la planta.</p>
        </div>
      )}
    </div>
  );
}

// ─── Planta Slot Card ─────────────────────────────────────────────────────────

function PlantaSlotCard({ slot }: { slot: any }) {
  const machineStatus: string = slot.machine_status ?? slot.workstation_status ?? 'idle';
  const statusColor = MACHINE_STATUS_COLOR[machineStatus as keyof typeof MACHINE_STATUS_COLOR] ?? 'bg-slate-400';
  const hasAlerts = (slot.critical_supply_alerts ?? 0) > 0;
  const workers: any[] = slot.workers_assigned ?? [];
  const activeOT: any = slot.active_ot;

  return (
    <Card className={cn('relative overflow-hidden transition-shadow hover:shadow-md', !slot.machine_id && 'opacity-50 border-dashed')}>
      {/* Left status stripe */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-1.5', statusColor)} />

      {/* Alert badge */}
      {hasAlerts && (
        <div className="absolute top-2 right-2">
          <Tooltip>
            <TooltipTrigger>
              <div className="flex items-center gap-1 bg-rose-500 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">
                <AlertTriangle className="h-3 w-3" />{slot.critical_supply_alerts}
              </div>
            </TooltipTrigger>
            <TooltipContent>Insumos críticos bajo el mínimo</TooltipContent>
          </Tooltip>
        </div>
      )}

      <CardHeader className="pl-4 pb-1 pt-3 pr-8">
        {/* Machine identity */}
        <div>
          <p className="font-bold text-sm leading-tight">
            {slot.machine_name ?? slot.workstation_name}
          </p>
          {(slot.brand || slot.model) && (
            <p className="text-xs text-muted-foreground">{slot.brand} {slot.model}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {slot.machine_type && (
            <Badge variant="secondary" className="text-xs">
              {MACHINE_TYPE_LABELS[slot.machine_type as keyof typeof MACHINE_TYPE_LABELS] ?? slot.machine_type}
            </Badge>
          )}
          {slot.colors > 1 && <Badge variant="outline" className="text-xs">{slot.colors}C</Badge>}
          <Badge className={cn('text-xs text-white', statusColor)}>
            {MACHINE_STATUS_LABELS[machineStatus as keyof typeof MACHINE_STATUS_LABELS] ?? machineStatus}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pl-4 pb-3 space-y-2">
        {/* Location + productivity */}
        {slot.location && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />{slot.location}
          </div>
        )}
        {(slot.nominal_speed_sheets_hr || slot.power_kw) && (
          <div className="flex gap-3 text-xs text-muted-foreground">
            {slot.nominal_speed_sheets_hr && (
              <span className="flex items-center gap-1">
                <Activity className="h-3 w-3" />{slot.nominal_speed_sheets_hr.toLocaleString()} h/hr
              </span>
            )}
            {slot.power_kw && (
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3 text-amber-400" />{slot.power_kw} kW
              </span>
            )}
          </div>
        )}

        {/* Active OT */}
        {activeOT ? (
          <div className={cn('rounded-md border px-2.5 py-1.5 text-xs', PRIORITY_COLOR[activeOT.priority] ?? 'border-sky-300 bg-sky-50 text-sky-700')}>
            <div className="flex items-center gap-1.5 font-semibold">
              <div className={cn('h-2 w-2 rounded-full', OT_STATUS_COLOR[activeOT.status] ?? 'bg-slate-400')} />
              OT {activeOT.ot_number} · {activeOT.client}
            </div>
            {activeOT.product && (
              <p className="truncate text-current/80 mt-0.5">{activeOT.product}</p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
            <ClipboardList className="h-3 w-3" />Sin OT activa
          </div>
        )}

        {/* Workers */}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {workers.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">Sin operarios asignados</span>
          ) : (
            workers.map((w: any) => (
              <Tooltip key={w.id}>
                <TooltipTrigger>
                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold uppercase border border-primary/20">
                    {w.name?.charAt(0)}
                  </div>
                </TooltipTrigger>
                <TooltipContent>{w.name} · {w.role}</TooltipContent>
              </Tooltip>
            ))
          )}
          {workers.length > 0 && (
            <span className="text-xs text-muted-foreground ml-1">{workers.length}/{slot.max_workers}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Planta List View ─────────────────────────────────────────────────────────

function PlantaListView({ slots }: { slots: any[] }) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium">Máquina</th>
            <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Tipo</th>
            <th className="text-left px-4 py-2.5 font-medium">Estado</th>
            <th className="text-left px-4 py-2.5 font-medium hidden lg:table-cell">OT activa</th>
            <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Personas</th>
            <th className="text-center px-4 py-2.5 font-medium">Alertas</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {slots.map(slot => {
            const machineStatus: string = slot.machine_status ?? slot.workstation_status ?? 'idle';
            const statusColor = MACHINE_STATUS_COLOR[machineStatus as keyof typeof MACHINE_STATUS_COLOR] ?? 'bg-slate-400';
            const workers: any[] = slot.workers_assigned ?? [];
            const activeOT: any = slot.active_ot;

            return (
              <tr key={slot.workstation_id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', statusColor)} />
                    <div>
                      <p className="font-medium">{slot.machine_name ?? slot.workstation_name}</p>
                      {(slot.brand || slot.model) && (
                        <p className="text-xs text-muted-foreground">{slot.brand} {slot.model}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                  {slot.machine_type ? MACHINE_TYPE_LABELS[slot.machine_type as keyof typeof MACHINE_TYPE_LABELS] : '—'}
                </td>
                <td className="px-4 py-3">
                  <Badge className={cn('text-xs text-white', statusColor)}>
                    {MACHINE_STATUS_LABELS[machineStatus as keyof typeof MACHINE_STATUS_LABELS] ?? machineStatus}
                  </Badge>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  {activeOT ? (
                    <span className="text-xs">OT {activeOT.ot_number} · {activeOT.client}</span>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  {workers.length > 0 ? (
                    <div className="flex items-center gap-1">
                      {workers.slice(0, 3).map((w: any) => (
                        <div key={w.id} className="h-6 w-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold uppercase text-primary">
                          {w.name?.charAt(0)}
                        </div>
                      ))}
                      {workers.length > 3 && <span className="text-xs text-muted-foreground">+{workers.length - 3}</span>}
                    </div>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  {(slot.critical_supply_alerts ?? 0) > 0 ? (
                    <Badge variant="destructive" className="text-xs">{slot.critical_supply_alerts}</Badge>
                  ) : <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {slots.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">No hay puestos que mostrar.</div>
      )}
    </div>
  );
}

// ─── Summary Chip ─────────────────────────────────────────────────────────────

function SummaryChip({ icon, label, value, color, urgent }: { icon: React.ReactNode; label: string; value: number; color: string; urgent?: boolean }) {
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-lg border p-2.5',
      urgent && value > 0 ? 'border-rose-300 bg-rose-50 dark:bg-rose-950/20' : 'bg-card'
    )}>
      {icon}
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none">{value}</p>
        <p className="text-xs text-muted-foreground truncate">{label}</p>
      </div>
    </div>
  );
}
