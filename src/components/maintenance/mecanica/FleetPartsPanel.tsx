'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PackageX, Ship, ShoppingCart, Truck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiCard } from '@/components/ui/kpi-card';
import { RankedList, type RankedListItem } from '@/components/ui/ranked-list';
import { STATUS_LABEL } from '@/lib/part-procurement';
import { URGENCY_COLOR, type FleetPartRow } from './types';

/**
 * Qué requiere atención en TODA la flota, no sólo la máquina elegida abajo.
 *
 * /api/machine-parts ya soportaba esto -- `machine_id` es un filtro
 * opcional, y sin él la ruta evalúa y ordena por urgencia (comparePartUrgency)
 * las piezas de todas las máquinas -- pero nada en la UI lo llamaba nunca
 * sin `machine_id`. El resto de este panel sigue mostrando una máquina a la
 * vez porque el flujo de "pedir todo"/plantilla es por máquina; esto es sólo
 * la vista de "qué mirar primero" antes de elegir cuál.
 */
function useFleetParts() {
  return useQuery<{ parts: FleetPartRow[]; summary: Record<string, number | boolean | undefined> }>({
    queryKey: ['machine-parts', 'fleet'],
    queryFn: async () => {
      const res = await fetch('/api/machine-parts');
      if (!res.ok) throw new Error('No se pudieron cargar las piezas de la flota');
      return res.json();
    },
  });
}

export function FleetPartsPanel({ onSelectMachine }: { onSelectMachine: (machineId: string) => void }) {
  const { data, isLoading } = useFleetParts();
  const summary = data?.summary ?? {};

  const ranked: RankedListItem[] = useMemo(() => {
    const urgentes = (data?.parts ?? []).filter(
      (p) => !p.on_order && ['vencida', 'atrasado', 'pedir_ahora'].includes(p.health.status)
    );
    // Ya vienen ordenadas por urgencia desde el backend (comparePartUrgency).
    return urgentes.slice(0, 8).map((p) => ({
      id: p.id,
      label: p.name,
      sublabel: p.machines?.name ?? '—',
      barPct: p.health.lifeUsedPct ?? 100,
      barColor: URGENCY_COLOR[p.health.status],
      value: STATUS_LABEL[p.health.status],
      title: p.health.reason,
      onClick: () => onSelectMachine(p.machine_id),
    }));
  }, [data?.parts, onSelectMachine]);

  if (isLoading) return <Skeleton className="h-56 w-full" />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Qué requiere atención en toda la flota</h2>
        <p className="text-xs text-muted-foreground">Piezas vencidas o por pedir, en cualquier máquina.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={PackageX} label="Vencidas" value={String(summary.vencidas ?? 0)} tone={Number(summary.vencidas ?? 0) > 0 ? 'critical' : 'default'} />
        <KpiCard icon={Ship} label="Pedido atrasado" value={String(summary.atrasadas ?? 0)} tone={Number(summary.atrasadas ?? 0) > 0 ? 'warning' : 'default'} />
        <KpiCard icon={ShoppingCart} label="Pedir ahora" value={String(summary.por_pedir ?? 0)} tone={Number(summary.por_pedir ?? 0) > 0 ? 'warning' : 'default'} />
        <KpiCard icon={Truck} label="En camino" value={String(summary.en_camino ?? 0)} tone="info" />
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Piezas más críticas de la flota</CardTitle>
          <p className="text-xs text-muted-foreground">Un clic abre esa máquina abajo.</p>
        </CardHeader>
        <CardContent>
          {ranked.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Ninguna pieza necesita compra ahora mismo en toda la flota.
            </p>
          ) : (
            <RankedList items={ranked} visibleCount={5} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
