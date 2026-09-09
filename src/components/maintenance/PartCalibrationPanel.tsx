'use client';

/**
 * Fase F del plan de Equipos/WhatsApp: ¿la vida útil que le pusimos a cada
 * pieza se parece a lo que de verdad dura? La aritmética vive en
 * part-calibration.ts; acá sólo se muestra -- mismo idioma visual
 * (KpiCard + RankedList) que el resto de Equipos.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/kpi-card';
import { RankedList, type RankedListItem } from '@/components/ui/ranked-list';
import { Gauge, TrendingDown, TrendingUp, CheckCircle2 } from 'lucide-react';
import { USAGE_UNIT_SHORT } from '@/lib/part-procurement';
import type { PartCalibrationReading } from '@/lib/part-calibration';

interface CalibrationResponse {
  readings: PartCalibrationReading[];
  summary: { total: number; within_tolerance: number; under: number; over: number };
  tolerance_pct: number;
}

function formatUsage(value: number, unit: string) {
  const short = USAGE_UNIT_SHORT[unit] ?? unit;
  return `${Math.round(value).toLocaleString('es-CL')} ${short}`;
}

export function PartCalibrationPanel() {
  const { data, isLoading } = useQuery<CalibrationResponse>({
    queryKey: ['machine-parts', 'calibration'],
    queryFn: async () => {
      const res = await fetch('/api/machine-parts/calibration');
      if (!res.ok) throw new Error('No se pudo cargar la calibración de piezas');
      return res.json();
    },
    staleTime: 60_000,
  });

  const ranked: RankedListItem[] = useMemo(() => {
    const readings = data?.readings ?? [];
    const max = Math.max(1, ...readings.map((r) => Math.abs(r.deltaPct)));
    return readings.map((r) => ({
      id: r.partId,
      label: r.partName,
      sublabel: r.machineName,
      barPct: (Math.abs(r.deltaPct) / max) * 100,
      barColor: r.deltaPct < 0 ? '#d03b3b' : undefined,
      value: `${r.deltaPct > 0 ? '+' : ''}${r.deltaPct}%`,
      title: `Duró ${formatUsage(r.observedLifeUsage, r.usageUnit)} de una vida esperada de ${formatUsage(r.expectedLifeUsage, r.usageUnit)}`,
    }));
  }, [data?.readings]);

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Cargando calibración…</p>;
  }

  const summary = data?.summary ?? { total: 0, within_tolerance: 0, under: 0, over: 0 };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Calibración de vida útil</h3>
        <p className="text-sm text-muted-foreground">
          La vida esperada de cada pieza contra lo que de verdad duró en su última falla real --
          para saber si hay que ajustar la estimación, no sólo la reposición.
        </p>
      </div>

      {summary.total === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Gauge className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <h4 className="text-base font-semibold">Todavía no hay lecturas para calibrar</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Se necesita al menos una orden correctiva cerrada con la pieza identificada y una
              línea base de uso conocida (vida esperada configurada, y un reemplazo o falla
              anterior registrados). Con el uso normal del módulo esto se va a ir llenando solo.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              icon={CheckCircle2}
              label="Vida útil realista"
              value={String(summary.within_tolerance)}
              hint={`De ${summary.total} pieza(s) con lectura, dentro de ±${data?.tolerance_pct ?? 10}%`}
              tone="success"
            />
            <KpiCard
              icon={TrendingDown}
              label="Fallan antes de lo esperado"
              value={String(summary.under)}
              hint="La estimación es optimista -- conviene pedir el repuesto antes"
              tone={summary.under > 0 ? 'critical' : 'default'}
            />
            <KpiCard
              icon={TrendingUp}
              label="Duran más de lo esperado"
              value={String(summary.over)}
              hint="La estimación es conservadora -- se puede estirar el reemplazo"
              tone={summary.over > 0 ? 'info' : 'default'}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Estimaciones más alejadas de la realidad</CardTitle>
              <p className="text-xs text-muted-foreground">
                Ordenado por qué tan lejos quedó la vida real de la esperada, en cualquier
                dirección.
              </p>
            </CardHeader>
            <CardContent>
              <RankedList items={ranked} visibleCount={8} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
