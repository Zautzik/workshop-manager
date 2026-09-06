'use client';

/**
 * MachineEconomicsDrift — lo que una máquina cuesta de verdad, al lado de lo
 * que el catálogo de costeo cobra por su hora.
 *
 * /api/machines/economics existía desde antes (energy_cost_per_hr,
 * maintenance_cost_monthly y depreciation_monthly ya se guardaban en el
 * perfil de cada máquina) pero nada la llamaba: los tres números se juntaban
 * en la ficha y nunca se comparaban contra la tarifa que el motor de costeo
 * realmente usa para cotizar. Una máquina podía costar más de lo que se le
 * cobraba a un cliente sin que nadie lo viera.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, TrendingUp, TrendingDown, Minus, CheckCircle2, Gauge } from 'lucide-react';
import { formatCLP } from '@/lib/format';
import { KpiCard } from '@/components/ui/kpi-card';
import { RankedList, type RankedListItem } from '@/components/ui/ranked-list';

interface MachineDriftRow {
  machine_id: string;
  name: string;
  type: string;
  status: string;
  derived_hourly: number;
  breakdown: { energy: number; maintenance: number; depreciation: number };
  data_complete: boolean;
  missing_fields: string[];
  drift: {
    catalog: number;
    derived: number;
    deltaPct: number | null;
    material: boolean;
    direction: 'under' | 'over' | 'aligned';
  };
}

interface MachineEconomicsResponse {
  monthly_productive_hours: number;
  catalog_hourly: number;
  machines: MachineDriftRow[];
  summary: { total: number; with_complete_economics: number; undercharging: number; overcharging: number; aligned: number };
}

const MISSING_FIELD_LABELS: Record<string, string> = {
  energy_cost_per_hr: 'costo de energía',
  maintenance_cost_monthly: 'mantenimiento mensual',
  depreciation_monthly: 'depreciación mensual',
};

function useMachineEconomics(hours: number) {
  return useQuery<MachineEconomicsResponse>({
    queryKey: ['machine-economics', hours],
    queryFn: async () => {
      const res = await fetch(`/api/machines/economics?hours=${hours}`, { credentials: 'include' });
      if (!res.ok) throw new Error('No se pudo calcular la economía de las máquinas');
      return res.json();
    },
    staleTime: 60_000,
  });
}

const DIRECTION_STYLE: Record<MachineDriftRow['drift']['direction'], { text: string; icon: typeof TrendingUp; label: string }> = {
  under: { text: 'text-red-500', icon: TrendingUp, label: 'Cobrando bajo costo' },
  over: { text: 'text-yellow-500', icon: TrendingDown, label: 'Cobrando sobre costo' },
  aligned: { text: 'text-green-500', icon: Minus, label: 'Alineada' },
};

export function MachineEconomicsDrift() {
  const [hours, setHours] = useState(195);
  const { data, isLoading, isError } = useMachineEconomics(hours);

  // Los hooks van antes de cualquier `return` anticipado (loading/error) --
  // si no, se saltan en algunos renders y React se queja de "more hooks than
  // during the previous render" apenas la data llega.
  const rankedUndercharging: RankedListItem[] = useMemo(() => {
    const undercharging = (data?.machines ?? []).filter((m) => m.data_complete && m.drift.direction === 'under');
    const sorted = [...undercharging].sort((a, b) => (b.drift.deltaPct ?? 0) - (a.drift.deltaPct ?? 0));
    const max = Math.max(1, ...sorted.map((m) => m.drift.deltaPct ?? 0));
    return sorted.map((m) => ({
      id: m.machine_id,
      label: m.name,
      sublabel: m.type,
      barPct: ((m.drift.deltaPct ?? 0) / max) * 100,
      barColor: '#ef4444',
      value: `+${m.drift.deltaPct}%`,
      title: `Cuesta ${formatCLP(m.derived_hourly)}/hr real vs ${formatCLP(m.drift.catalog)}/hr de catálogo`,
    }));
  }, [data?.machines]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Calculando economía de máquinas…</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-destructive">No se pudo calcular la economía de las máquinas.</p>;
  }

  const undercharging = data.machines.filter((m) => m.data_complete && m.drift.direction === 'under');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={TrendingUp} label="Cobrando bajo costo" value={String(data.summary.undercharging)} tone={data.summary.undercharging > 0 ? 'critical' : 'default'} />
        <KpiCard icon={TrendingDown} label="Cobrando sobre costo" value={String(data.summary.overcharging)} tone={data.summary.overcharging > 0 ? 'warning' : 'default'} />
        <KpiCard icon={CheckCircle2} label="Alineadas" value={String(data.summary.aligned)} tone="success" />
        <KpiCard icon={Gauge} label="Con datos completos" value={`${data.summary.with_complete_economics}/${data.summary.total}`} />
      </div>

      {rankedUndercharging.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Máquinas que más se subcobran</CardTitle>
            <p className="text-xs text-muted-foreground">
              Cuánto más cuesta la hora real que la hora que el catálogo cobra por ella.
            </p>
          </CardHeader>
          <CardContent>
            <RankedList items={rankedUndercharging} visibleCount={5} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Tarifa real vs. tarifa de catálogo</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              El catálogo cobra <b className="text-foreground">{formatCLP(data.catalog_hourly)}/hr</b> por
              prensa. Esto es lo que cada máquina cuesta de verdad, prorrateando mantención y
              depreciación sobre sus horas productivas del mes.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Label htmlFor="hours-input" className="text-xs text-muted-foreground whitespace-nowrap">
              Horas productivas/mes
            </Label>
            <Input
              id="hours-input"
              type="number"
              min={1}
              value={hours}
              onChange={(e) => setHours(Math.max(1, Number(e.target.value) || 195))}
              className="h-8 w-20 text-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4 font-medium">Máquina</th>
                  <th className="text-right py-2 px-4 font-medium">Costo real / hr</th>
                  <th className="text-right py-2 px-4 font-medium">Catálogo / hr</th>
                  <th className="text-right py-2 px-4 font-medium">Diferencia</th>
                  <th className="text-center py-2 px-4 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.machines.map((m) => {
                  if (!m.data_complete) {
                    return (
                      <tr key={m.machine_id} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-4">{m.name}</td>
                        <td colSpan={4} className="py-2 px-4 text-muted-foreground text-sm">
                          Faltan datos: {m.missing_fields.map((f) => MISSING_FIELD_LABELS[f] ?? f).join(', ')}
                        </td>
                      </tr>
                    );
                  }
                  const style = DIRECTION_STYLE[m.drift.direction];
                  const Icon = style.icon;
                  return (
                    <tr key={m.machine_id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-4">
                        {m.name}
                        <span className="ml-1.5 text-xs text-muted-foreground">{m.type}</span>
                      </td>
                      <td className="py-2 px-4 text-right font-semibold">{formatCLP(m.derived_hourly)}</td>
                      <td className="py-2 px-4 text-right text-muted-foreground">{formatCLP(m.drift.catalog)}</td>
                      <td className={`py-2 px-4 text-right font-bold ${style.text}`}>
                        {m.drift.deltaPct != null ? `${m.drift.deltaPct > 0 ? '+' : ''}${m.drift.deltaPct}%` : '—'}
                      </td>
                      <td className={`py-2 px-4 text-center font-semibold ${style.text}`}>
                        <Icon className="inline h-4 w-4 mr-1" />
                        {style.label}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {undercharging.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {undercharging.length === 1
              ? `${undercharging[0].name} cuesta más por hora de lo que el catálogo cobra por su tiempo de prensa.`
              : `${undercharging.length} máquinas cuestan más por hora de lo que el catálogo cobra por su tiempo de prensa.`}{' '}
            Las cotizaciones que las usan pueden estar subestimando el costo real.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default MachineEconomicsDrift;
