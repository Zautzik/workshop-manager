'use client';

/**
 * FleetAvailability — disponibilidad real de la planta, no sólo cumplimiento
 * de órdenes.
 *
 * `machine_downtime_logs` y /api/maintenance/downtime existían desde antes:
 * cada orden de mantención ya abre y cierra su fila de downtime al empezar y
 * terminar (ver syncDowntime en work-orders/[id]/route.ts), pero nada leía
 * esa tabla. "Estadísticas de Mantenimiento" mostraba cuántas órdenes se
 * completaron sin decir nunca cuánto tiempo estuvo la planta realmente
 * parada — la pregunta más básica de un taller.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Gauge } from 'lucide-react';

interface DowntimeMachineRow {
  machine_id: string;
  name: string;
  type: string;
  status: string;
  downtime_hours: number;
  downtime_events: number;
  currently_down: boolean;
  availability_pct: number;
}

interface DowntimeLog {
  id: string;
  machine_id: string;
  reason: string | null;
  start_time: string;
  end_time: string | null;
  duration_hours: number | null;
}

interface DowntimeResponse {
  window_days: number;
  machines: DowntimeMachineRow[];
  totals: { downtime_hours: number; machines_down_now: number; fleet_availability_pct: number };
  recent: DowntimeLog[];
}

function useFleetDowntime(days: number) {
  return useQuery<DowntimeResponse>({
    queryKey: ['maintenance', 'downtime', days],
    queryFn: async () => {
      const res = await fetch(`/api/maintenance/downtime?days=${days}`, { credentials: 'include' });
      if (!res.ok) throw new Error('No se pudo calcular la disponibilidad de la flota');
      return res.json();
    },
    staleTime: 60_000,
  });
}

function availabilityColor(pct: number): string {
  if (pct < 85) return 'text-red-500';
  if (pct < 95) return 'text-yellow-500';
  return 'text-green-500';
}

export function FleetAvailability() {
  const [days, setDays] = useState(30);
  const { data, isLoading, isError } = useFleetDowntime(days);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Gauge className="h-4 w-4" />Disponibilidad de la flota
        </CardTitle>
        <div className="flex shrink-0 items-center gap-2">
          <Label htmlFor="downtime-days" className="text-xs text-muted-foreground whitespace-nowrap">
            Ventana (días)
          </Label>
          <Input
            id="downtime-days"
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Math.min(365, Math.max(1, Number(e.target.value) || 30)))}
            className="h-8 w-16 text-sm"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Calculando disponibilidad…</p>
        ) : isError || !data ? (
          <p className="text-sm text-destructive">No se pudo calcular la disponibilidad de la flota.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className={`text-2xl font-bold ${availabilityColor(data.totals.fleet_availability_pct)}`}>
                {data.totals.fleet_availability_pct}%
              </span>
              <span className="text-muted-foreground">disponibilidad promedio, últimos {data.window_days} días</span>
              <span className="text-muted-foreground">{data.totals.downtime_hours}h de downtime acumulado</span>
              {data.totals.machines_down_now > 0 && (
                <Badge variant="destructive">{data.totals.machines_down_now} caída{data.totals.machines_down_now > 1 ? 's' : ''} ahora</Badge>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-4 font-medium">Máquina</th>
                    <th className="text-right py-2 px-4 font-medium">Downtime</th>
                    <th className="text-right py-2 px-4 font-medium">Eventos</th>
                    <th className="text-right py-2 px-4 font-medium">Disponibilidad</th>
                  </tr>
                </thead>
                <tbody>
                  {data.machines.map((m) => (
                    <tr key={m.machine_id} className={`border-b hover:bg-muted/50 ${m.currently_down ? 'bg-red-500/5' : ''}`}>
                      <td className="py-2 px-4">
                        {m.name}
                        <span className="ml-1.5 text-xs text-muted-foreground">{m.type}</span>
                        {m.currently_down && (
                          <Badge variant="destructive" className="ml-2 text-[10px]">Caída ahora</Badge>
                        )}
                      </td>
                      <td className="py-2 px-4 text-right">{m.downtime_hours}h</td>
                      <td className="py-2 px-4 text-right text-muted-foreground">{m.downtime_events}</td>
                      <td className={`py-2 px-4 text-right font-bold ${availabilityColor(m.availability_pct)}`}>
                        {m.availability_pct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.recent.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Eventos recientes</p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {data.recent.slice(0, 8).map((log) => {
                    const machine = data.machines.find((m) => m.machine_id === log.machine_id);
                    return (
                      <li key={log.id} className="flex items-center gap-2">
                        <span className="text-foreground">{machine?.name ?? log.machine_id}</span>
                        <span>{log.reason}</span>
                        <span>
                          {log.duration_hours != null ? `${log.duration_hours}h` : 'en curso'}
                        </span>
                        <span>{new Date(log.start_time).toLocaleDateString('es-CL')}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default FleetAvailability;
