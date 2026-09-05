'use client';

/**
 * VencimientosPanel — todo lo que necesita atención, en un solo lugar.
 *
 * Antes eran dos vistas que no se hablaban: `PautasVencidas` (pautas
 * calendario-o-uso, de sólo lectura) en /equipos/programa (fuera del menú), y
 * "Alertas & Predictivo" en /equipos/alertas (órdenes pendientes cuya fecha ya
 * pasó). Son señales distintas -- una pauta vencida es trabajo que todavía no
 * se ha emitido; una orden pendiente vencida es trabajo que sí se emitió pero
 * no se ha hecho -- y las dos importan, así que se muestran juntas pero
 * separadas, no mezcladas en una sola lista.
 *
 * "Crear orden" es lo que faltaba para que ver una pauta vencida sirviera de
 * algo: antes había que saber que existía /equipos/mecanica y crear la orden
 * a mano, sin que quedara enlazada a la pauta que la originó.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isPast, parseISO, differenceInDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  CalendarClock, Gauge, TriangleAlert, CheckCircle2, HelpCircle, Wrench, Cpu, Calendar,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useMaintenanceWorkOrdersByStatus } from '@/hooks/use-maintenance-queries';
import { DUE_STATUS_LABEL, type DueStatus, type DueResult } from '@/lib/maintenance-due';
import { usageUnitShort } from '@/types/machine-usage-unit';

interface ScheduleRow {
  id: string;
  machine_id: string;
  system_id: string | null;
  checklist_id: string | null;
  checklist_name: string | null;
  machine_name: string | null;
  maintenance_type: string;
  description: string | null;
  frequency_days: number | null;
  frequency_usage: number | null;
  usage_unit: string;
  machine_systems: { name: string } | null;
  due: DueResult;
}

const STYLE: Record<DueStatus, { badge: string; icon: typeof TriangleAlert }> = {
  vencida:   { badge: 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300', icon: TriangleAlert },
  proxima:   { badge: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300', icon: CalendarClock },
  al_dia:    { badge: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', icon: CheckCircle2 },
  sin_datos: { badge: 'border-slate-500/30 bg-slate-500/15 text-slate-600 dark:text-slate-300', icon: HelpCircle },
};

const nf = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });

function useSchedules() {
  return useQuery<{ schedules: ScheduleRow[]; summary: Record<string, number> }>({
    queryKey: ['maintenance-schedules'],
    queryFn: async () => {
      const res = await fetch('/api/maintenance/schedules', { credentials: 'include' });
      if (!res.ok) throw new Error('No se pudieron cargar las pautas');
      return res.json();
    },
  });
}

function useCreateOrderFromSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (schedule: ScheduleRow) => {
      const res = await fetch('/api/maintenance/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          machine_id: schedule.machine_id,
          work_order_type: 'preventivo',
          checklist_id: schedule.checklist_id,
          schedule_id: schedule.id,
          system_id: schedule.system_id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo crear la orden');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['maintenance', 'workOrders'] });
    },
  });
}

function ScheduleRowItem({
  row,
  onCreateOrder,
  creatingId,
}: {
  row: ScheduleRow;
  onCreateOrder: (row: ScheduleRow) => void;
  creatingId: string | null;
}) {
  const st = STYLE[row.due.status];
  const Icon = st.icon;
  const unidad = usageUnitShort(row.usage_unit);
  const canCreate = Boolean(row.checklist_id);
  const showAction = row.due.status === 'vencida' || row.due.status === 'proxima';

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{row.machine_name ?? 'Sin máquina'}</span>
          <Badge variant="secondary" className="text-xs">{row.maintenance_type}</Badge>
          {row.machine_systems?.name && (
            <span className="text-xs text-muted-foreground">{row.machine_systems.name}</span>
          )}
        </div>
        {row.description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{row.description}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{row.due.reason}</p>
        <p className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {row.frequency_days ? <span>cada {row.frequency_days} días</span> : null}
          {row.frequency_usage ? (
            <span className="inline-flex items-center gap-1">
              <Gauge className="h-3 w-3" />
              cada {nf.format(row.frequency_usage)} {unidad}
            </span>
          ) : null}
          {row.checklist_name && <span>· {row.checklist_name}</span>}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          {row.due.driver && (
            <Badge variant="outline" className="gap-1 text-xs">
              {row.due.driver === 'uso' ? <Gauge className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
              por {row.due.driver}
            </Badge>
          )}
          <Badge variant="outline" className={`gap-1 ${st.badge}`}>
            <Icon className="h-3 w-3" />
            {DUE_STATUS_LABEL[row.due.status]}
          </Badge>
        </div>
        {showAction && (
          <Button
            size="sm"
            variant={canCreate ? 'default' : 'outline'}
            disabled={!canCreate || creatingId === row.id}
            title={canCreate ? undefined : 'Esta pauta no tiene checklist — agrégale una en Pautas antes de crear la orden'}
            onClick={() => onCreateOrder(row)}
          >
            <Wrench className="mr-1.5 h-3.5 w-3.5" />
            {creatingId === row.id ? 'Creando…' : 'Crear orden'}
          </Button>
        )}
      </div>
    </li>
  );
}

function SchedulesSection() {
  const { data, isLoading } = useSchedules();
  const { toast } = useToast();
  const createOrder = useCreateOrderFromSchedule();
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const handleCreate = async (row: ScheduleRow) => {
    setCreatingId(row.id);
    try {
      await createOrder.mutateAsync(row);
      toast({ title: 'Orden creada', description: `${row.machine_name ?? 'Máquina'}: orden preventiva emitida desde esta pauta.` });
    } catch (e: any) {
      toast({ title: 'No se pudo crear la orden', description: e.message, variant: 'destructive' });
    } finally {
      setCreatingId(null);
    }
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const schedules = data?.schedules ?? [];
  const s = data?.summary ?? {};

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4" />
            Pautas de mantenimiento
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            {Number(s.vencidas ?? 0) > 0 && (
              <Badge variant="outline" className={STYLE.vencida.badge}>{s.vencidas} vencidas</Badge>
            )}
            {Number(s.proximas ?? 0) > 0 && (
              <Badge variant="outline" className={STYLE.proxima.badge}>{s.proximas} próximas</Badge>
            )}
            <Badge variant="secondary">{s.total ?? 0} en total</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {Number(s.por_uso ?? 0) === 0 && schedules.length > 0 && (
          <p className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-800 dark:text-sky-200">
            <Gauge className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Todas las pautas vencen sólo por calendario. Si le pones frecuencia por uso a las
            que corresponde —lubricar cada tantas impresiones, filtro cada tantas horas— el
            contador empieza a mandar sobre el mantenimiento, no el almanaque.
          </p>
        )}

        {schedules.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No hay pautas cargadas. Cree una en la pestaña Pautas.
          </p>
        ) : (
          <ul className="divide-y">
            {schedules.map((row) => (
              <ScheduleRowItem key={row.id} row={row} onCreateOrder={handleCreate} creatingId={creatingId} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PendingOrdersSection() {
  const { data: orders = [], isLoading } = useMaintenanceWorkOrdersByStatus(['pending']);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const overdue = orders.filter((o: any) => o.scheduled_date && isPast(parseISO(o.scheduled_date)));
  const upcoming = orders.filter((o: any) => o.scheduled_date && !isPast(parseISO(o.scheduled_date)));

  if (overdue.length === 0 && upcoming.length === 0) return null;

  const Row = ({ o, overdue: isOverdue }: { o: any; overdue: boolean }) => {
    const daysOverdue = o.scheduled_date ? differenceInDays(new Date(), parseISO(o.scheduled_date)) : null;
    return (
      <li className={`flex flex-wrap items-center justify-between gap-3 p-4 ${isOverdue ? 'bg-destructive/5' : ''}`}>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{o.maintenance_checklists?.name ?? o.title ?? 'Orden pendiente'}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {o.machines?.name && (
              <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{o.machines.name}</span>
            )}
            {o.scheduled_date && (
              <span className={`flex items-center gap-1 ${isOverdue ? 'text-destructive/80' : ''}`}>
                <Calendar className="h-3 w-3" />
                {format(parseISO(o.scheduled_date), 'PP', { locale: es })}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge className={isOverdue ? 'bg-destructive/90 text-white border-0 text-[10px] font-bold' : 'bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px] font-bold'}>
            {isOverdue ? 'Vencida' : 'Próxima'}
          </Badge>
          {isOverdue && daysOverdue !== null && daysOverdue > 0 && (
            <span className="text-[10px] text-destructive/80 font-semibold">{daysOverdue}d atraso</span>
          )}
        </div>
      </li>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TriangleAlert className="h-4 w-4" />
            Órdenes pendientes sin empezar
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            {overdue.length > 0 && <Badge variant="outline" className={STYLE.vencida.badge}>{overdue.length} vencidas</Badge>}
            {upcoming.length > 0 && <Badge variant="outline" className={STYLE.proxima.badge}>{upcoming.length} próximas</Badge>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Ya se emitieron — a diferencia de las pautas de arriba, esto no es "crear la orden", es "ir a hacerla" en la pestaña Órdenes.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y">
          {overdue.map((o: any) => <Row key={o.id} o={o} overdue />)}
          {upcoming.map((o: any) => <Row key={o.id} o={o} overdue={false} />)}
        </ul>
      </CardContent>
    </Card>
  );
}

export function VencimientosPanel() {
  return (
    <div className="space-y-6">
      <SchedulesSection />
      <PendingOrdersSection />
    </div>
  );
}

export default VencimientosPanel;
