'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useOTs } from '@/hooks/use-operations-queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMemo } from 'react';
import { TrendingUp, BarChart3 } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts';
import { format, parseISO, startOfMonth, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente', in_progress: 'En proceso',
  completed: 'Completada', cancelled: 'Cancelada',
};

function TrendsDashboard() {
  const { data: ots = [], isLoading } = useOTs();

  const monthlyData = useMemo(() => {
    const byMonth: Record<string, { month: string; total: number; completed: number }> = {};
    for (const ot of ots as any[]) {
      const d = ot.created_at ? parseISO(ot.created_at) : null;
      if (!d || !isValid(d)) continue;
      const key = format(startOfMonth(d), 'yyyy-MM');
      const label = format(startOfMonth(d), 'MMM yy', { locale: es });
      if (!byMonth[key]) byMonth[key] = { month: label, total: 0, completed: 0 };
      byMonth[key].total += 1;
      if (ot.status === 'completed') byMonth[key].completed += 1;
    }
    return Object.values(byMonth).slice(-12);
  }, [ots]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ot of ots as any[]) counts[ot.status] = (counts[ot.status] || 0) + 1;
    return Object.entries(counts).map(([status, count]) => ({ name: STATUS_LABELS[status] ?? status, value: count }));
  }, [ots]);

  if (isLoading) return <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-64 w-full" />)}</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />OTs creadas vs completadas por mes</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthlyData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="total"     name="Creadas"     stroke="#6366f1" fill="#6366f130" strokeWidth={2} />
              <Area type="monotone" dataKey="completed" name="Completadas"  stroke="#22c55e" fill="#22c55e30" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" />Distribución por estado</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={statusData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" name="OTs" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
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
