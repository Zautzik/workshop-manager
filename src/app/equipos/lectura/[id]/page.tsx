'use client';

/**
 * Menú al que llega el QR pegado en la máquina -- un solo código por equipo,
 * dos caminos desde acá: anotar la lectura del contador (lo que esta
 * pantalla hacía directamente antes, ver contador/page.tsx) o revisar qué
 * mantención tiene pendiente (nuevo, /equipos/mantenciones/[id]).
 *
 * Se resolvió como menú y no como dos QR separados a propósito: imprimir y
 * pegar una segunda etiqueta por máquina es fricción real en el taller, y el
 * mismo escaneo ya identifica de sobra la máquina para las dos preguntas.
 */

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Gauge, Wrench, TriangleAlert, ChevronRight } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { machineTypeLabel } from '@/types/machine-type';

interface MachineInfo {
  machine: { id: string; name: string; type: string };
}

interface PendingSummary {
  openOrders: number;
  vencidasSinOrden: number;
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

/**
 * Cuenta rápida para el badge del menú -- no repite la lógica completa de
 * MachinePendingMaintenance.tsx, sólo cuánto hay para que el técnico sepa si
 * vale la pena entrar antes de tocar el botón.
 */
function usePendingCount(id: string) {
  return useQuery<PendingSummary>({
    queryKey: ['machine-pending-maintenance-count', id],
    queryFn: async () => {
      const [ordersRes, schedulesRes] = await Promise.all([
        fetch('/api/maintenance/work-orders?status=pending,in_progress', { credentials: 'include' }),
        fetch(`/api/maintenance/schedules?machine_id=${id}`, { credentials: 'include' }),
      ]);
      const orders = ordersRes.ok ? await ordersRes.json() : { orders: [] };
      const schedules = schedulesRes.ok ? await schedulesRes.json() : { schedules: [] };
      const machineOrders = (orders.orders ?? []).filter((o: any) => o.machine_id === id);
      const scheduleIdsWithOpenOrder = new Set(machineOrders.map((o: any) => o.schedule_id));
      const vencidasSinOrden = (schedules.schedules ?? []).filter(
        (s: any) => s.due?.status === 'vencida' && !scheduleIdsWithOpenOrder.has(s.id)
      ).length;
      return { openOrders: machineOrders.length, vencidasSinOrden };
    },
  });
}

function MenuScreen({ id }: { id: string }) {
  const { data, isLoading, error } = useMachineInfo(id);
  const { data: pending } = usePendingCount(id);

  if (isLoading) return <div className="p-6"><Skeleton className="h-72 w-full" /></div>;

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <TriangleAlert className="mx-auto h-10 w-10 text-amber-500" />
        <p className="mt-3 font-medium">No se encontró esta máquina</p>
        <p className="mt-1 text-sm text-muted-foreground">
          El código QR puede ser de un equipo que ya no está registrado.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/equipos/mecanica">Ir a Mecánica</Link>
        </Button>
      </div>
    );
  }

  const { machine } = data;
  const pendienteTotal = (pending?.openOrders ?? 0) + (pending?.vencidasSinOrden ?? 0);

  return (
    <div className="mx-auto max-w-md space-y-6 p-5">
      <div>
        <h1 className="text-2xl font-bold leading-tight">{machine.name}</h1>
        <p className="text-sm text-muted-foreground">{machineTypeLabel(machine.type)}</p>
      </div>

      <div className="space-y-3">
        <Link
          href={`/equipos/lectura/${id}/contador`}
          className="flex items-center gap-4 rounded-2xl border bg-card p-5 transition-colors hover:bg-muted/40"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Gauge className="h-6 w-6" />
          </span>
          <span className="flex-1">
            <span className="block text-base font-semibold">Anotar lectura</span>
            <span className="block text-sm text-muted-foreground">Registrar el contador de la máquina</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </Link>

        <Link
          href={`/equipos/mantenciones/${id}`}
          className="flex items-center gap-4 rounded-2xl border bg-card p-5 transition-colors hover:bg-muted/40"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Wrench className="h-6 w-6" />
          </span>
          <span className="flex-1">
            <span className="flex items-center gap-2 text-base font-semibold">
              Mantenciones pendientes
              {pendienteTotal > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">
                  {pendienteTotal}
                </span>
              )}
            </span>
            <span className="block text-sm text-muted-foreground">Órdenes abiertas y pautas vencidas</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
}

export default function LecturaLandingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor', 'technician']}>
      <div className="min-h-screen bg-background">
        <MenuScreen id={id} />
      </div>
    </ProtectedRoute>
  );
}
