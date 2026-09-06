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
 *
 * V2: la lista de pautas mostraba las 29 —incluidas las 11 al día, con la
 * misma tarjeta de 4 líneas que las vencidas— antes de llegar a las órdenes
 * pendientes. Era la misma trampa que ya se corrigió en Rentabilidad: "no es
 * un dashboard de un vistazo, es una tabla larga". Se resuelve igual: una
 * fila de KPI arriba, filas de una línea (no cuatro), y lo que ya está al
 * día se guarda detrás de un acordeón en vez de ocupar el mismo lugar que lo
 * urgente.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isPast, parseISO, differenceInDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  CalendarClock, Gauge, TriangleAlert, CheckCircle2, HelpCircle, Wrench, Cpu, Calendar, ChevronDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiCard } from '@/components/ui/kpi-card';
import { useToast } from '@/hooks/use-toast';
import {
  useMaintenanceWorkOrdersByStatus,
  useMaintenanceSchedules,
  type MaintenanceScheduleRow as ScheduleRow,
} from '@/hooks/use-maintenance-queries';
import { DUE_STATUS_LABEL, type DueStatus } from '@/lib/maintenance-due';
import { usageUnitShort } from '@/types/machine-usage-unit';

const STYLE: Record<DueStatus, { badge: string; icon: typeof TriangleAlert }> = {
  vencida:   { badge: 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300', icon: TriangleAlert },
  proxima:   { badge: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300', icon: CalendarClock },
  al_dia:    { badge: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', icon: CheckCircle2 },
  sin_datos: { badge: 'border-slate-500/30 bg-slate-500/15 text-slate-600 dark:text-slate-300', icon: HelpCircle },
};

const nf = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
/** Cuántas pautas accionables se muestran antes de pedir "ver todas". */
const VISIBLE_SCHEDULES = 8;

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
      queryClient.invalidateQueries({ queryKey: ['maintenance', 'schedules'] });
      queryClient.invalidateQueries({ queryKey: ['maintenance', 'workOrders'] });
    },
  });
}

/** Una línea de nombre + badges, una línea de detalle -- no cuatro. */
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

  const detailParts = [
    row.frequency_days ? `cada ${row.frequency_days} días` : null,
    row.frequency_usage ? `cada ${nf.format(row.frequency_usage)} ${unidad}` : null,
    row.checklist_name,
  ].filter(Boolean) as string[];

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{row.machine_name ?? 'Sin máquina'}</span>
          <Badge variant="outline" className={`gap-1 text-[10px] ${st.badge}`}>
            <Icon className="h-3 w-3" />
            {DUE_STATUS_LABEL[row.due.status]}
          </Badge>
          {row.due.driver && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              {row.due.driver === 'uso' ? <Gauge className="h-2.5 w-2.5" /> : <CalendarClock className="h-2.5 w-2.5" />}
              por {row.due.driver}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {row.due.reason}
          {detailParts.length > 0 ? ` · ${detailParts.join(' · ')}` : ''}
        </p>
      </div>

      {showAction && (
        <Button
          size="sm"
          variant={canCreate ? 'default' : 'outline'}
          disabled={!canCreate || creatingId === row.id}
          title={canCreate ? undefined : 'Esta pauta no tiene checklist — agrégale una en Pautas antes de crear la orden'}
          onClick={() => onCreateOrder(row)}
          className="shrink-0"
        >
          <Wrench className="mr-1.5 h-3.5 w-3.5" />
          {creatingId === row.id ? 'Creando…' : 'Crear orden'}
        </Button>
      )}
    </li>
  );
}

function SchedulesSection({
  schedules,
  summary,
}: {
  schedules: ScheduleRow[];
  summary: Record<string, number>;
}) {
  const { toast } = useToast();
  const createOrder = useCreateOrderFromSchedule();
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showAlDia, setShowAlDia] = useState(false);

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

  // Lo accionable primero (vencida, luego próxima); lo que ya está al día se
  // guarda aparte -- no compite por el mismo espacio que lo urgente.
  const accionables = useMemo(
    () => schedules.filter((r) => r.due.status === 'vencida' || r.due.status === 'proxima')
      .sort((a, b) => (a.due.status === b.due.status ? 0 : a.due.status === 'vencida' ? -1 : 1)),
    [schedules],
  );
  const alDia = useMemo(
    () => schedules.filter((r) => r.due.status !== 'vencida' && r.due.status !== 'proxima'),
    [schedules],
  );

  const shownAccionables = showAll ? accionables : accionables.slice(0, VISIBLE_SCHEDULES);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4" />
            Pautas de mantenimiento
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            {Number(summary.vencidas ?? 0) > 0 && (
              <Badge variant="outline" className={STYLE.vencida.badge}>{summary.vencidas} vencidas</Badge>
            )}
            {Number(summary.proximas ?? 0) > 0 && (
              <Badge variant="outline" className={STYLE.proxima.badge}>{summary.proximas} próximas</Badge>
            )}
            <Badge variant="secondary">{summary.total ?? 0} en total</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {Number(summary.por_uso ?? 0) === 0 && schedules.length > 0 && (
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
        ) : accionables.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            Ninguna pauta vencida ni próxima — todo al día.
          </p>
        ) : (
          <>
            <ul className="divide-y">
              {shownAccionables.map((row) => (
                <ScheduleRowItem key={row.id} row={row} onCreateOrder={handleCreate} creatingId={creatingId} />
              ))}
            </ul>
            {accionables.length > VISIBLE_SCHEDULES && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="w-full border-t px-4 py-2 text-left text-xs font-medium text-primary hover:bg-muted/40"
              >
                {showAll ? `Mostrar sólo las primeras ${VISIBLE_SCHEDULES}` : `Ver todas (${accionables.length})`}
              </button>
            )}
          </>
        )}

        {alDia.length > 0 && (
          <div className="border-t">
            <button
              type="button"
              onClick={() => setShowAlDia((v) => !v)}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted/40"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAlDia ? 'rotate-180' : ''}`} />
              {alDia.length} al día — sin acción pendiente
            </button>
            {showAlDia && (
              <ul className="divide-y border-t">
                {alDia.map((row) => (
                  <ScheduleRowItem key={row.id} row={row} onCreateOrder={handleCreate} creatingId={creatingId} />
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PendingOrdersSection({ overdue, upcoming }: { overdue: any[]; upcoming: any[] }) {
  if (overdue.length === 0 && upcoming.length === 0) return null;

  const Row = ({ o, overdue: isOverdue }: { o: any; overdue: boolean }) => {
    const daysOverdue = o.scheduled_date ? differenceInDays(new Date(), parseISO(o.scheduled_date)) : null;
    return (
      <li className={`flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 ${isOverdue ? 'bg-destructive/5' : ''}`}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{o.maintenance_checklists?.name ?? o.title ?? 'Orden pendiente'}</span>
            <Badge className={isOverdue ? 'bg-destructive/90 text-white border-0 text-[10px] font-bold' : 'bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px] font-bold'}>
              {isOverdue ? 'Vencida' : 'Próxima'}
            </Badge>
            {isOverdue && daysOverdue !== null && daysOverdue > 0 && (
              <span className="text-[10px] font-semibold text-destructive/80">{daysOverdue}d atraso</span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {o.machines?.name && (
              <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{o.machines.name}</span>
            )}
            {o.scheduled_date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {format(parseISO(o.scheduled_date), 'PP', { locale: es })}
              </span>
            )}
          </div>
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
  const { data: schedulesData, isLoading: loadingSchedules } = useMaintenanceSchedules();
  const { data: orders = [], isLoading: loadingOrders } = useMaintenanceWorkOrdersByStatus(['pending']);

  if (loadingSchedules || loadingOrders) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const schedules = schedulesData?.schedules ?? [];
  const summary = (schedulesData?.summary ?? {}) as Record<string, number>;
  const overdueOrders = orders.filter((o: any) => o.scheduled_date && isPast(parseISO(o.scheduled_date)));
  const upcomingOrders = orders.filter((o: any) => o.scheduled_date && !isPast(parseISO(o.scheduled_date)));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard icon={TriangleAlert} label="Pautas vencidas" value={String(summary.vencidas ?? 0)} tone={Number(summary.vencidas ?? 0) > 0 ? 'critical' : 'default'} />
        <KpiCard icon={CalendarClock} label="Pautas próximas" value={String(summary.proximas ?? 0)} tone={Number(summary.proximas ?? 0) > 0 ? 'warning' : 'default'} />
        <KpiCard icon={TriangleAlert} label="Órdenes vencidas" value={String(overdueOrders.length)} tone={overdueOrders.length > 0 ? 'critical' : 'default'} hint="Emitidas, sin iniciar" />
        <KpiCard icon={CalendarClock} label="Órdenes próximas" value={String(upcomingOrders.length)} tone={upcomingOrders.length > 0 ? 'warning' : 'default'} hint="Emitidas, sin iniciar" />
      </div>
      <SchedulesSection schedules={schedules} summary={summary} />
      <PendingOrdersSection overdue={overdueOrders} upcoming={upcomingOrders} />
    </div>
  );
}

export default VencimientosPanel;
