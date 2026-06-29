'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useOTs } from '@/hooks/use-operations-queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { useMemo } from 'react';
import { TrendingUp, BarChart3 } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend,
  BarChart, Bar,
} from 'recharts';
import { format, parseISO, startOfMonth, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { otStatusLabel } from '@/lib/status-labels';

interface TrendOt { status: string | null; created_at: string | null; }

// ── Chart colour configs — referenced as var(--color-<key>) inside SVG ──────
const areaConfig: ChartConfig = {
  total:     { label: 'Creadas',     color: 'hsl(243 75% 59%)' },
  completed: { label: 'Completadas', color: 'hsl(142 71% 45%)' },
} satisfies ChartConfig;

const barConfig: ChartConfig = {
  value: { label: 'OTs', color: 'hsl(243 75% 59%)' },
} satisfies ChartConfig;

function TrendsDashboard() {
  const { data, isLoading } = useOTs();
  const ots = (data ?? []) as TrendOt[];

  const monthlyData = useMemo(() => {
    const byMonth: Record<string, { month: string; total: number; completed: number }> = {};
    for (const ot of ots) {
      const d = ot.created_at ? parseISO(ot.created_at) : null;
      if (!d || !isValid(d)) continue;
      const key = format(startOfMonth(d), 'yyyy-MM');
      const label = format(startOfMonth(d), 'MMM yy', { locale: es });
      if (!byMonth[key]) byMonth[key] = { month: label, total: 0, completed: 0 };
      byMonth[key].total += 1;
      if (ot.status === 'completed') byMonth[key].completed += 1;
    }
    // Chronological order — OTs arrive newest-first, so sort by month key
    // ascending before taking the last 12 (the axis read jun→may→abr otherwise).
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v)
      .slice(-12);
  }, [ots]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ot of ots) {
      const key = ot.status ?? 'unknown';
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts).map(([status, count]) => ({
      name: otStatusLabel(status),
      value: count,
    }));
  }, [ots]);

  return (
    <div className="space-y-6">
      {/* ── Area chart — always rendered, skeleton swaps content not wrapper ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />OTs creadas vs completadas por mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[260px] w-full rounded-lg" />
          ) : (
            <ChartContainer config={areaConfig} className="h-[260px] w-full">
              <AreaChart data={monthlyData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  {/* Gradient fills that fade to transparent — the "breathing" effect */}
                  <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--color-total)"     stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--color-total)"     stopOpacity={0}    />
                  </linearGradient>
                  <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--color-completed)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--color-completed)" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  strokeOpacity={0.08}
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="total"
                  name="total"
                  stroke="var(--color-total)"
                  fill="url(#gradTotal)"
                  strokeWidth={2}
                  dot={false}
                  animationDuration={400}
                  animationEasing="ease-out"
                />
                <Area
                  type="monotone"
                  dataKey="completed"
                  name="completed"
                  stroke="var(--color-completed)"
                  fill="url(#gradCompleted)"
                  strokeWidth={2}
                  dot={false}
                  animationDuration={400}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Bar chart ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />Distribución por estado
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[200px] w-full rounded-lg" />
          ) : (
            <ChartContainer config={barConfig} className="h-[200px] w-full">
              <BarChart data={statusData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  strokeOpacity={0.08}
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="value"
                  name="value"
                  fill="var(--color-value)"
                  radius={[4, 4, 0, 0]}
                  animationDuration={400}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ManagerTendenciasPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tendencias</h1>
          <p className="text-sm text-muted-foreground mt-1">Análisis de tendencias históricas de producción</p>
        </div>
        <TrendsDashboard />
      </div>
    </ProtectedRoute>
  );
}
