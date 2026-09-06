'use client';

/**
 * OrdenesPanel — lista de órdenes de trabajo, con ejecución real.
 *
 * Antes esto eran dos pantallas separadas: una lista de sólo lectura acá, y
 * WorkOrderExecution en /equipos/ejecucion (en inglés, sólo pending/
 * in_progress) para tildar tareas — que en realidad no persistía nada, salvo
 * el estado general de la orden. Ver el comentario en
 * work-orders/[id]/route.ts: dependía de maintenance_task_completions, una
 * tabla que apunta a maintenance_tasks, donde nada en toda la app inserta
 * jamás una fila. Muerto desde dos direcciones a la vez.
 *
 * Acá el detalle de cada ítem vive en completed_items (JSONB) directamente en
 * la orden — un snapshot, no un join en vivo a la checklist, así que editar
 * la checklist después no reescribe lo que esta orden ya hizo.
 *
 * V2: mostraba las 39 órdenes -- 32 completadas incluidas -- en una sola
 * lista plana sin KPI ni agrupar, la misma trampa ya corregida en
 * Vencimientos. Se separa lo activo (pending/in_progress, siempre visible
 * completo -- es lo que hay que hacer) de lo completado (capado con "ver
 * todas", igual que el resto del módulo); el archivo cronológico completo
 * ya vive en Historial & KPIs, esto no intenta duplicarlo.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ClipboardList, Calendar, Cpu, AlertCircle, Play, CheckCircle2, Wrench, Info, Clock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { KpiCard } from '@/components/ui/kpi-card';
import { useToast } from '@/hooks/use-toast';
import { useMaintenanceWorkOrders } from '@/hooks/use-maintenance-queries';

/** Cuántas órdenes completadas se muestran antes de pedir "ver todas". */
const VISIBLE_COMPLETED = 6;

const STATUS_COLOR: Record<string, string> = {
  pending:     'bg-amber-500',
  in_progress: 'bg-blue-500',
  completed:   'bg-green-500',
  cancelled:   'bg-gray-400',
};
const STATUS_LABEL: Record<string, string> = {
  pending:     'Pendiente',
  in_progress: 'En curso',
  completed:   'Completada',
  cancelled:   'Cancelada',
};

interface CompletedItem {
  item_id: string;
  title?: string;
  description?: string;
  estimated_minutes?: number | null;
  completed: boolean;
  completed_at?: string | null;
  completed_by?: string | null;
  notes?: string | null;
}

/**
 * De la checklist (JSONB, dos formas conviven en datos reales -- la del
 * editor `{id, title, estimatedTime}` y la de datos sembrados `{order,
 * description, estimated_minutes}`) o del snapshot ya guardado. Nunca
 * inventa `completed`: si la orden no tiene completed_items, arranca todo en
 * false para una orden nueva, o se marca `untracked` para una ya completada
 * de antes de que este snapshot existiera -- no se puede decir qué se hizo
 * de verdad, así que no se finge saberlo.
 */
function deriveItems(order: any): { items: CompletedItem[]; tracked: boolean } {
  if (Array.isArray(order.completed_items)) {
    return { items: order.completed_items, tracked: true };
  }
  const checklistItems = order.maintenance_checklists?.items;
  if (!Array.isArray(checklistItems) || checklistItems.length === 0) {
    return { items: [], tracked: true };
  }
  const isHistorical = order.status === 'completed' || order.status === 'cancelled';
  const items = checklistItems.map((raw: any, i: number) => ({
    item_id: raw.id ?? `item-${raw.order ?? i}`,
    title: raw.title ?? raw.description ?? `Paso ${i + 1}`,
    description: raw.title ? raw.description : undefined,
    estimated_minutes: raw.estimatedTime ?? raw.estimated_minutes ?? null,
    completed: false,
    notes: null,
  }));
  return { items, tracked: !isHistorical };
}

function OrderDetailDialog({ order, onClose }: { order: any; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { items: initialItems, tracked } = useMemo(() => deriveItems(order), [order]);
  const [items, setItems] = useState<CompletedItem[]>(initialItems);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const editable = tracked && (order.status === 'pending' || order.status === 'in_progress');

  const patchOrder = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/maintenance/work-orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo actualizar la orden');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance', 'workOrders'] });
      queryClient.invalidateQueries({ queryKey: ['maintenance', 'schedules'] });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const start = async () => {
    await patchOrder.mutateAsync({ status: 'in_progress', started_at: new Date().toISOString() });
    toast({ title: 'Orden iniciada' });
  };

  const toggleItem = async (itemId: string) => {
    const now = new Date().toISOString();
    const updated = items.map((it) =>
      it.item_id === itemId
        ? { ...it, completed: !it.completed, completed_at: !it.completed ? now : null, notes: notesDraft[itemId] ?? it.notes }
        : it
    );
    setItems(updated);
    await patchOrder.mutateAsync({ completed_items: updated });
  };

  const complete = async () => {
    if (items.length > 0 && !items.every((it) => it.completed)) {
      toast({ title: 'Faltan tareas', description: 'Completa todos los ítems antes de cerrar la orden.', variant: 'destructive' });
      return;
    }
    const totalMinutes = items.reduce((s, it) => s + (it.estimated_minutes ?? 0), 0);
    await patchOrder.mutateAsync({
      status: 'completed',
      completed_at: new Date().toISOString(),
      total_time_minutes: totalMinutes || undefined,
      completed_items: items,
    });
    toast({ title: 'Orden completada' });
    onClose();
  };

  const progress = items.length > 0 ? (items.filter((it) => it.completed).length / items.length) * 100 : 0;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            {order.maintenance_checklists?.name ?? order.title ?? 'Orden de trabajo'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {order.machines?.name && <span className="flex items-center gap-1"><Cpu className="h-3.5 w-3.5" />{order.machines.name}</span>}
            {order.scheduled_date && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{format(new Date(order.scheduled_date), 'PPP', { locale: es })}</span>}
            <Badge variant="outline">{STATUS_LABEL[order.status] ?? order.status}</Badge>
          </div>

          {order.fault_description && (
            <p className="rounded-md border border-border bg-muted/30 p-3 text-sm">{order.fault_description}</p>
          )}

          {!tracked && (
            <p className="flex items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-800 dark:text-sky-200">
              <Info className="h-3.5 w-3.5 shrink-0" />
              Esta orden se completó antes de que el sistema registrara el detalle por ítem — se muestra la checklist como referencia, no como registro de lo que se hizo.
            </p>
          )}

          {items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progreso</span>
                <span className="font-medium">{items.filter((it) => it.completed).length} / {items.length} tareas</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {items.length === 0 ? (
            <Card className="p-6 text-center">
              <AlertCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Esta orden no tiene checklist asociada.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {items.map((it) => (
                <Card key={it.item_id} className={`p-3 ${it.completed ? 'bg-green-500/10' : ''}`}>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={it.completed}
                      disabled={!editable || patchOrder.isPending}
                      onCheckedChange={() => toggleItem(it.item_id)}
                      className="mt-1"
                    />
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-medium ${it.completed ? 'line-through text-muted-foreground' : ''}`}>{it.title}</span>
                        {it.estimated_minutes ? <Badge variant="outline" className="text-xs shrink-0">~{it.estimated_minutes} min</Badge> : null}
                      </div>
                      {it.description && <p className="text-xs text-muted-foreground">{it.description}</p>}
                      {editable && !it.completed && (
                        <Textarea
                          placeholder="Notas (opcional)"
                          value={notesDraft[it.item_id] ?? it.notes ?? ''}
                          onChange={(e) => setNotesDraft((prev) => ({ ...prev, [it.item_id]: e.target.value }))}
                          className="text-sm"
                          rows={1}
                        />
                      )}
                      {!editable && it.notes && <p className="text-xs italic text-muted-foreground">{it.notes}</p>}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {order.status === 'pending' && (
            <Button className="w-full" onClick={start} disabled={patchOrder.isPending}>
              <Play className="mr-2 h-4 w-4" /> Iniciar orden
            </Button>
          )}
          {order.status === 'in_progress' && (
            <Button
              className="w-full"
              onClick={complete}
              disabled={patchOrder.isPending || (items.length > 0 && !items.every((it) => it.completed))}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> Completar orden
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OrderCard({ order, onClick }: { order: any; onClick: () => void }) {
  return (
    <Card
      className="cursor-pointer overflow-hidden transition-colors hover:bg-muted/40"
      onClick={onClick}
    >
      <div className={`h-1 w-full ${STATUS_COLOR[order.status] ?? 'bg-gray-300'}`} />
      <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{order.maintenance_checklists?.name ?? order.title ?? 'Sin checklist'}</span>
            <Badge variant="outline" className="text-xs">{STATUS_LABEL[order.status] ?? order.status}</Badge>
            {order.priority && <Badge className="bg-orange-500 text-xs text-white">Prioridad {order.priority}</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {order.machines?.name && <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{order.machines.name}</span>}
            {order.scheduled_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(order.scheduled_date), 'PPP', { locale: es })}</span>}
            {order.maintenance_checklists?.frequency && <span className="capitalize">{order.maintenance_checklists.frequency}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function OrdenesPanel() {
  const { data: orders = [], isLoading, isError, error } = useMaintenanceWorkOrders();
  // El id, no el objeto: así el diálogo siempre lee el status recién
  // refetcheado tras iniciar/completar, en vez de quedarse con el snapshot
  // de cuando se abrió (que decía "Pendiente" para siempre aunque el PATCH
  // ya hubiera cambiado el status en el servidor).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const selected = orders.find((o: any) => o.id === selectedId) ?? null;

  const pending = useMemo(() => orders.filter((o: any) => o.status === 'pending'), [orders]);
  const inProgress = useMemo(() => orders.filter((o: any) => o.status === 'in_progress'), [orders]);
  // La API devuelve las órdenes ordenadas por scheduled_date ascendente; acá
  // interesa la más reciente primero -- "completadas" es un vistazo de
  // actividad reciente, no el archivo cronológico completo (eso vive en
  // Historial & KPIs).
  const completed = useMemo(
    () => orders.filter((o: any) => o.status === 'completed').slice().reverse(),
    [orders],
  );
  const active = useMemo(() => [...inProgress, ...pending], [inProgress, pending]);
  const shownCompleted = showAllCompleted ? completed : completed.slice(0, VISIBLE_COMPLETED);
  const totalMinutes = useMemo(() => completed.reduce((s: number, o: any) => s + (o.total_time_minutes ?? 0), 0), [completed]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      </div>
    );
  }
  if (isError) return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="flex items-center gap-3 p-6">
        <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
        <p className="text-sm text-destructive">{error instanceof Error ? error.message : 'Error cargando órdenes.'}</p>
      </CardContent>
    </Card>
  );
  if (!orders.length) return (
    <div className="py-20 text-center text-muted-foreground">
      <ClipboardList className="mx-auto mb-3 h-10 w-10 opacity-30" />
      <p className="font-medium">No hay órdenes de trabajo registradas.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard icon={ClipboardList} label="Pendientes" value={String(pending.length)} tone={pending.length > 0 ? 'warning' : 'default'} />
        <KpiCard icon={Play} label="En curso" value={String(inProgress.length)} tone={inProgress.length > 0 ? 'info' : 'default'} />
        <KpiCard icon={CheckCircle2} label="Completadas" value={String(completed.length)} tone="success" />
        <KpiCard icon={Clock} label="Horas registradas" value={`${Math.round(totalMinutes / 60)} h`} hint="En órdenes completadas" />
      </div>

      {active.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          Ninguna orden pendiente ni en curso — todo al día.
        </p>
      ) : (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Órdenes activas</h3>
          {active.map((o: any) => (
            <OrderCard key={o.id} order={o} onClick={() => setSelectedId(o.id)} />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Completadas</h3>
          {shownCompleted.map((o: any) => (
            <OrderCard key={o.id} order={o} onClick={() => setSelectedId(o.id)} />
          ))}
          {completed.length > VISIBLE_COMPLETED && (
            <button
              type="button"
              onClick={() => setShowAllCompleted((v) => !v)}
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              {showAllCompleted ? `Mostrar sólo las últimas ${VISIBLE_COMPLETED}` : `Ver todas (${completed.length})`}
            </button>
          )}
        </div>
      )}

      {selected && <OrderDetailDialog key={selected.id} order={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

export default OrdenesPanel;
