'use client';

/**
 * Mantenciones pendientes de una máquina, para el teléfono -- a esto se
 * llega escaneando el QR pegado en el equipo y tocando "Mantenciones
 * pendientes" en el menú (ver /equipos/lectura/[id]/page.tsx).
 *
 * Dos listas, igual que VencimientosPanel: órdenes ya emitidas (se pueden
 * trabajar ahora mismo, acá) y pautas vencidas que todavía no tienen una
 * (el cron diario las convierte solo, pero puede no haber corrido todavía,
 * o faltarle el checklist -- "Crear orden" es la misma acción que ya existe
 * en Vencimientos, no una nueva).
 *
 * Ejecutar una orden acá pasa por el mismo PATCH que el escritorio
 * (applyWorkOrderUpdate) y la misma derivación de ítems
 * (deriveChecklistItems, extraída de OrdenesPanel.tsx) -- cerrar una orden
 * desde el teléfono del taller cuenta exactamente igual que desde Órdenes.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Wrench, TriangleAlert, CheckCircle2, Play, Clock, CalendarClock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  useMaintenanceWorkOrdersByStatus,
  useMaintenanceSchedules,
  useCreateOrderFromSchedule,
} from '@/hooks/use-maintenance-queries';
import { deriveChecklistItems, type CompletedChecklistItem } from '@/lib/checklist-items';
import { machineTypeLabel } from '@/types/machine-type';

interface MachineInfo {
  machine: { id: string; name: string; type: string };
}

function useMachineInfo(id: string) {
  return useQuery<MachineInfo>({
    queryKey: ['machine-usage', id],
    queryFn: async () => {
      const res = await fetch(`/api/machines/${id}/usage`);
      if (!res.ok) throw new Error('No se pudo cargar la máquina');
      return res.json();
    },
  });
}

/** Ejecución de una orden, en línea (no un diálogo) -- misma lógica que OrderDetailDialog en OrdenesPanel.tsx, adaptada a una pantalla angosta. */
function MobileOrderCard({ order }: { order: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const { items: initialItems, tracked } = useMemo(() => deriveChecklistItems(order), [order]);
  const [items, setItems] = useState<CompletedChecklistItem[]>(initialItems);

  const editable = tracked && (order.status === 'pending' || order.status === 'in_progress');

  const patch = useMutation({
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
      qc.invalidateQueries({ queryKey: ['maintenance'] });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const start = () => patch.mutate({ status: 'in_progress', started_at: new Date().toISOString() });

  const toggleItem = (itemId: string) => {
    const now = new Date().toISOString();
    const updated = items.map((it) =>
      it.item_id === itemId ? { ...it, completed: !it.completed, completed_at: !it.completed ? now : null } : it
    );
    setItems(updated);
    patch.mutate({ completed_items: updated });
  };

  const complete = () => {
    if (items.length > 0 && !items.every((it) => it.completed)) {
      toast({ title: 'Faltan tareas', description: 'Completa todos los ítems antes de cerrar la orden.', variant: 'destructive' });
      return;
    }
    const totalMinutes = items.reduce((s, it) => s + (it.estimated_minutes ?? 0), 0);
    patch.mutate({
      status: 'completed',
      completed_at: new Date().toISOString(),
      total_time_minutes: totalMinutes || undefined,
      completed_items: items,
    });
    toast({ title: 'Orden completada' });
  };

  const title = order.maintenance_checklists?.name ?? order.title ?? 'Orden de trabajo';
  const doneCount = items.filter((it) => it.completed).length;

  return (
    <div className="rounded-2xl border bg-card">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-start gap-3 p-4 text-left">
        <span
          className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${order.status === 'in_progress' ? 'bg-blue-500' : 'bg-amber-500'}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block font-medium leading-tight">{title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {order.priority && <Badge className="bg-orange-500 text-[10px] text-white">Prioridad {order.priority}</Badge>}
            <span>{order.status === 'in_progress' ? 'En curso' : 'Pendiente'}</span>
            {items.length > 0 && <span>· {doneCount}/{items.length} tareas</span>}
          </span>
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t p-4">
          {order.fault_description && (
            <p className="rounded-lg border bg-muted/30 p-3 text-sm">{order.fault_description}</p>
          )}

          {items.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">Esta orden no tiene checklist asociada.</p>
          ) : (
            <div className="space-y-2">
              {items.map((it) => (
                <label
                  key={it.item_id}
                  className={`flex items-start gap-3 rounded-xl border p-3 ${it.completed ? 'bg-emerald-500/10' : ''}`}
                >
                  <Checkbox
                    checked={it.completed}
                    disabled={!editable || patch.isPending}
                    onCheckedChange={() => toggleItem(it.item_id)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-medium ${it.completed ? 'text-muted-foreground line-through' : ''}`}>
                      {it.title}
                    </span>
                    {it.description && <span className="block text-xs text-muted-foreground">{it.description}</span>}
                    {it.estimated_minutes ? (
                      <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" /> ~{it.estimated_minutes} min
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          )}

          {order.status === 'pending' && (
            <Button className="h-12 w-full" onClick={start} disabled={patch.isPending}>
              <Play className="mr-2 h-4 w-4" /> Iniciar orden
            </Button>
          )}
          {order.status === 'in_progress' && (
            <Button
              className="h-12 w-full"
              onClick={complete}
              disabled={patch.isPending || (items.length > 0 && !items.every((it) => it.completed))}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> Completar orden
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ScheduleDueCard({ schedule }: { schedule: any }) {
  const { toast } = useToast();
  const createOrder = useCreateOrderFromSchedule();
  const canCreate = Boolean(schedule.checklist_id);

  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-4">
      <TriangleAlert className="h-5 w-5 shrink-0 text-red-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{schedule.checklist_name ?? schedule.description ?? 'Pauta vencida'}</p>
        <p className="text-xs text-muted-foreground">{schedule.due?.reason}</p>
      </div>
      <Button
        size="sm"
        disabled={!canCreate || createOrder.isPending}
        title={canCreate ? undefined : 'Sin checklist -- agrégale una en Pautas'}
        onClick={() =>
          createOrder.mutate(schedule, {
            onSuccess: () => toast({ title: 'Orden creada' }),
            onError: (e) => toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' }),
          })
        }
      >
        {createOrder.isPending ? '…' : 'Crear orden'}
      </Button>
    </div>
  );
}

export function MachinePendingMaintenance({ id }: { id: string }) {
  const { data: machineInfo, isLoading: loadingMachine, error: machineError } = useMachineInfo(id);
  const { data: allOpenOrders = [], isLoading: loadingOrders } = useMaintenanceWorkOrdersByStatus(['pending', 'in_progress']);
  const { data: scheduleData, isLoading: loadingSchedules } = useMaintenanceSchedules(id);

  const machineOrders = useMemo(
    () => (allOpenOrders as any[]).filter((o) => o.machine_id === id),
    [allOpenOrders, id],
  );
  const schedules = scheduleData?.schedules ?? [];
  const scheduleIdsWithOpenOrder = useMemo(
    () => new Set(machineOrders.map((o) => o.schedule_id).filter(Boolean)),
    [machineOrders],
  );
  const vencidasSinOrden = useMemo(
    () => schedules.filter((s: any) => s.due?.status === 'vencida' && !scheduleIdsWithOpenOrder.has(s.id)),
    [schedules, scheduleIdsWithOpenOrder],
  );

  const isLoading = loadingMachine || loadingOrders || loadingSchedules;

  if (isLoading) return <div className="p-6"><Skeleton className="h-72 w-full" /></div>;

  if (machineError || !machineInfo) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <TriangleAlert className="mx-auto h-10 w-10 text-amber-500" />
        <p className="mt-3 font-medium">No se encontró esta máquina</p>
      </div>
    );
  }

  const { machine } = machineInfo;
  const nada = machineOrders.length === 0 && vencidasSinOrden.length === 0;

  return (
    <div className="mx-auto max-w-md space-y-6 p-5">
      <div>
        <Link href={`/equipos/lectura/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> {machine.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold leading-tight">Mantenciones pendientes</h1>
        <p className="text-sm text-muted-foreground">{machineTypeLabel(machine.type)}</p>
      </div>

      {nada ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          <p className="text-sm text-muted-foreground">Sin mantenciones pendientes — todo al día.</p>
        </div>
      ) : (
        <>
          {machineOrders.length > 0 && (
            <div className="space-y-3">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <Wrench className="h-3.5 w-3.5" /> Órdenes abiertas ({machineOrders.length})
              </h2>
              {machineOrders.map((o) => <MobileOrderCard key={o.id} order={o} />)}
            </div>
          )}

          {vencidasSinOrden.length > 0 && (
            <div className="space-y-3">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" /> Pautas vencidas sin orden ({vencidasSinOrden.length})
              </h2>
              {vencidasSinOrden.map((s: any) => <ScheduleDueCard key={s.id} schedule={s} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default MachinePendingMaintenance;
