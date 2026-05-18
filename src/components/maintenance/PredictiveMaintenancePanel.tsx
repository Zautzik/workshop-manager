'use client';

/**
 * PredictiveMaintenancePanel
 *
 * Estimates each machine's load from completed OTs (sheets produced)
 * and flags those approaching or exceeding the service interval threshold.
 *
 * Threshold (default 500,000 sheets between services) is based on nominal_speed_sheets_hr
 * and estimated run hours accumulated from completed OTs assigned to each machine.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMachines } from '@/hooks/use-machines';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle2, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

const SERVICE_INTERVAL_SHEETS = 500_000; // configurable per machine in future

type MachineStat = {
  machine_id: string;
  total_sheets: number;
};

function useMachineSheetTotals() {
  return useQuery<MachineStat[]>({
    queryKey: ['predictive-maintenance-sheets'],
    queryFn: async () => {
      // Sum quantity_sheets from completed OTs per machine via ot_machine_schedule
      const { data } = await (supabase as any)
        .from('ot_machine_schedule')
        .select('machine_id, ots(quantity_sheets, status)')
        .eq('ots.status', 'completed');

      if (!data) return [];

      const totals: Record<string, number> = {};
      (data as any[]).forEach(row => {
        if (!row.machine_id) return;
        const sheets = row.ots?.quantity_sheets ?? 0;
        totals[row.machine_id] = (totals[row.machine_id] ?? 0) + sheets;
      });

      return Object.entries(totals).map(([machine_id, total_sheets]) => ({
        machine_id,
        total_sheets,
      }));
    },
  });
}

export function PredictiveMaintenancePanel() {
  const { data: machines = [] } = useMachines();
  const { data: stats = [], isLoading } = useMachineSheetTotals();

  const enriched = (machines as any[])
    .filter(m => m.is_active)
    .map(machine => {
      const stat = stats.find(s => s.machine_id === machine.id);
      const sheets = stat?.total_sheets ?? 0;
      const interval = SERVICE_INTERVAL_SHEETS;
      const pct = Math.min((sheets / interval) * 100, 100);
      const status: 'ok' | 'warning' | 'critical' =
        pct >= 95 ? 'critical' : pct >= 75 ? 'warning' : 'ok';
      return { ...machine, sheets, interval, pct, predictiveStatus: status };
    })
    .sort((a, b) => b.pct - a.pct);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground p-4">Calculando carga acumulada…</p>;
  }

  const criticalCount = enriched.filter(m => m.predictiveStatus === 'critical').length;
  const warningCount  = enriched.filter(m => m.predictiveStatus === 'warning').length;

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="flex gap-4">
        {criticalCount > 0 && (
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm font-medium">
            <AlertTriangle className="h-4 w-4" />
            {criticalCount} equipo{criticalCount > 1 ? 's' : ''} crítico{criticalCount > 1 ? 's' : ''}
          </div>
        )}
        {warningCount > 0 && (
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm font-medium">
            <Wrench className="h-4 w-4" />
            {warningCount} próximo{warningCount > 1 ? 's' : ''} a servicio
          </div>
        )}
        {criticalCount === 0 && warningCount === 0 && (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Todos los equipos dentro del intervalo de servicio
          </div>
        )}
      </div>

      {/* Machine rows */}
      <div className="space-y-3">
        {enriched.map(machine => (
          <div key={machine.id} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{machine.name}</span>
                <span className="text-xs text-muted-foreground">{machine.brand}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {machine.sheets.toLocaleString()} / {machine.interval.toLocaleString()} hojas
                </span>
                <Badge
                  className={cn(
                    'text-[10px]',
                    machine.predictiveStatus === 'critical' && 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30',
                    machine.predictiveStatus === 'warning'  && 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
                    machine.predictiveStatus === 'ok'       && 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30',
                  )}
                  variant="outline"
                >
                  {machine.predictiveStatus === 'critical' ? 'Servicio urgente' :
                   machine.predictiveStatus === 'warning'  ? 'Próximo servicio' : 'OK'}
                </Badge>
              </div>
            </div>
            <Progress
              value={machine.pct}
              className={cn(
                'h-2',
                machine.predictiveStatus === 'critical' && '[&>div]:bg-red-500',
                machine.predictiveStatus === 'warning'  && '[&>div]:bg-amber-500',
                machine.predictiveStatus === 'ok'       && '[&>div]:bg-green-500',
              )}
            />
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Intervalo de servicio basado en {SERVICE_INTERVAL_SHEETS.toLocaleString()} hojas acumuladas de OTs completadas.
      </p>
    </div>
  );
}
