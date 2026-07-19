'use client';
import { useMemo } from 'react';
import { otStatusLabel, otStatusHex, machineStatusLabel } from '@/lib/status-labels';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatCLP } from '@/lib/format';
import { 
  TrendingUp, TrendingDown, Target, AlertTriangle, CheckCircle2, 
  Clock, Zap, Activity, BarChart3, PieChart, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RechartsPie, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';
import { useMaintenanceWorkOrdersByStatus } from '@/hooks/use-maintenance-queries';
import { useMachines, useOTs, useWorkers } from '@/hooks/use-operations-queries';
import { useAnalyticsFiltersOptional, inPeriod, pctChange } from '@/contexts/AnalyticsFiltersContext';

interface OTByStatus {
  status: string;
  count: number;
}

interface MachineStatus {
  status: string;
  count: number;
}

interface WorkerPerformance {
  department: string;
  avgEfficiency: number;
  totalWorkers: number;
}

const ExecutiveOverview = () => {
  const { t } = useLanguage();
  const { range, comparison } = useAnalyticsFiltersOptional();
  const { data: ots = [], isLoading: otsLoading } = useOTs();
  const { data: machines = [], isLoading: machinesLoading } = useMachines();
  const { data: workers = [], isLoading: workersLoading } = useWorkers();
  const { data: pendingMaintenance = [], isLoading: maintenanceLoading } = useMaintenanceWorkOrdersByStatus(['pending']);

  const loading = otsLoading || machinesLoading || workersLoading || maintenanceLoading;

  const otsByStatus: OTByStatus[] = useMemo(() => {
    const statusCounts = ots.reduce((acc: Record<string, number>, ot: any) => {
      acc[ot.status] = (acc[ot.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count: Number(count),
    }));
  }, [ots]);

  const machineStatus: MachineStatus[] = useMemo(() => {
    const statusCounts = machines.reduce((acc: Record<string, number>, machine: any) => {
      acc[machine.status] = (acc[machine.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count: Number(count),
    }));
  }, [machines]);

  const workerPerformance: WorkerPerformance[] = useMemo(() => {
    const deptStats = workers.reduce((acc: Record<string, { total: number; count: number }>, worker: any) => {
      const dept = worker.department;
      if (!acc[dept]) acc[dept] = { total: 0, count: 0 };
      acc[dept].total += ((worker.quality_score || 75) + (worker.speed_score || 75)) / 2;
      acc[dept].count += 1;
      return acc;
    }, {} as Record<string, { total: number; count: number }>);
    return Object.entries(deptStats).map(([department, stats]) => ({
      department,
      avgEfficiency: Math.round(stats.total / stats.count),
      totalWorkers: stats.count,
    }));
  }, [workers]);

  // On-time rate among completed OTs (with a deadline) whose completion
  // (updated_at proxy) fell inside the given window.
  const onTimeRate = (period: typeof range): number | null => {
    const done = ots.filter((ot: any) =>
      ot.status === 'completed' && ot.deadline && inPeriod(ot.updated_at, period)
    );
    if (done.length === 0) return null;
    const onTime = done.filter((ot: any) =>
      new Date(ot.updated_at).getTime() <= new Date(ot.deadline).getTime()
    ).length;
    return (onTime / done.length) * 100;
  };

  const kpis = useMemo(() => {
    const activeOTs = ots.filter((ot: any) => ot.status !== 'completed').length;
    const completedThisMonth = ots.filter((ot: any) => ot.status === 'completed').length;
    // Revenue billed in the selected period (sum of OT totals). Engine keeps
    // decimals; the card rounds to whole pesos via formatCLP.
    const monthlyRevenue = ots
      .filter((ot: any) => inPeriod(ot.created_at, range))
      .reduce((s: number, ot: any) => s + Number(ot.total_price || 0), 0);
    const runningMachines = machines.filter((m: any) => m.status === 'running').length;
    const totalMachines = machines.length || 1;
    const machineUtilization = Math.round((runningMachines / totalMachines) * 100);
    const pendingCount = pendingMaintenance.length;

    // Real period-over-period deltas (replace the old hardcoded +12% / +2.3%).
    const createdInRange = ots.filter((ot: any) => inPeriod(ot.created_at, range)).length;
    const createdInComparison = ots.filter((ot: any) => inPeriod(ot.created_at, comparison)).length;
    const activeOTsDelta = pctChange(createdInRange, createdInComparison);

    const onTimeRange = onTimeRate(range);
    const onTimeComparison = onTimeRate(comparison);
    // Headline: period value when present, else all-time on-time rate.
    const allDone = ots.filter((ot: any) => ot.status === 'completed' && ot.deadline);
    const onTimeAll = allDone.length > 0
      ? (allDone.filter((ot: any) => new Date(ot.updated_at).getTime() <= new Date(ot.deadline).getTime()).length / allDone.length) * 100
      : 0;
    const onTimeDelivery = Math.round(onTimeRange ?? onTimeAll);
    const onTimeDeliveryDelta =
      onTimeRange != null && onTimeComparison != null ? onTimeRange - onTimeComparison : null;

    // Workforce efficiency: real average of per-department scores.
    const workforceEfficiency = workerPerformance.length > 0
      ? Math.round(workerPerformance.reduce((s, d) => s + d.avgEfficiency, 0) / workerPerformance.length)
      : 0;

    return {
      activeOTs,
      completedThisMonth,
      machineUtilization,
      runningMachines,
      totalMachines,
      monthlyRevenue,
      onTimeDelivery,
      onTimeDeliveryDelta,
      activeOTsDelta,
      workforceEfficiency,
      pendingMaintenance: pendingCount,
      criticalAlerts: pendingCount > 3 ? pendingCount - 3 : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machines, ots, pendingMaintenance, workerPerformance, range, comparison]);

  // Chart slice colors come from the shared phase palette (single source) so
  // a status reads the same hue here as on the board (2026-07 audit).
  const statusColor = (status: string) => otStatusHex(status);

  const machineColors: Record<string, string> = {
    idle: 'hsl(var(--muted-foreground))',
    running: 'hsl(142 76% 36%)',
    maintenance: 'hsl(45 93% 47%)',
    offline: 'hsl(0 84% 60%)',
  };

  const formatStatus = (status: string) => otStatusLabel(status);

  // Real period-over-period delta indicator (replaces hardcoded figures).
  const renderDelta = (value: number | null, suffix = '%') => {
    if (value == null) return <span className="text-xs text-muted-foreground">sin base</span>;
    const up = value >= 0;
    const Icon = up ? ArrowUpRight : ArrowDownRight;
    return (
      <div className={`flex items-center text-sm ${up ? 'text-green-500' : 'text-red-500'}`}>
        <Icon className="h-4 w-4" />
        <span>{up ? '+' : ''}{value.toFixed(1)}{suffix}</span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
        {[...Array(8)].map((_, i) => (
          <Card key={i} className="h-32 bg-muted/50" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Scorecards - Balanced Scorecard Approach */}
      <section aria-label="Indicadores Clave de Desempeño">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          KPIs Estratégicos - Cuadro de Mando
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Revenue — money billed this period */}
          <Card className="border-l-4 border-l-emerald-600 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Ingresos del Mes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{formatCLP(kpis.monthlyRevenue)}</div>
              <p className="text-xs text-muted-foreground mt-1">Facturación del período</p>
            </CardContent>
          </Card>

          {/* Financial Perspective */}
          <Card className="border-l-4 border-l-green-500 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Órdenes de Trabajo Activas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-3xl font-bold text-foreground">{kpis.activeOTs}</div>
                  <p className="text-xs text-muted-foreground mt-1">En proceso · creación vs período ant.</p>
                </div>
                {renderDelta(kpis.activeOTsDelta)}
              </div>
              <Progress value={Math.min(kpis.activeOTs * 10, 100)} className="mt-3 h-1" />
            </CardContent>
          </Card>

          {/* Customer Perspective */}
          <Card className="border-l-4 border-l-blue-500 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Entregas a Tiempo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-3xl font-bold text-foreground">{kpis.onTimeDelivery}%</div>
                  <p className="text-xs text-muted-foreground mt-1">Entregadas dentro de plazo</p>
                </div>
                {renderDelta(kpis.onTimeDeliveryDelta, ' pts')}
              </div>
              <Progress value={kpis.onTimeDelivery} className="mt-3 h-1" />
            </CardContent>
          </Card>

          {/* Internal Process Perspective */}
          <Card className="border-l-4 border-l-purple-500 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Máquinas Activas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-3xl font-bold text-foreground">{kpis.machineUtilization}%</div>
                  <p className="text-xs text-muted-foreground mt-1">{kpis.runningMachines} de {kpis.totalMachines} en marcha</p>
                </div>
                <Badge variant={kpis.machineUtilization >= 75 ? 'default' : 'destructive'} className="text-xs">
                  {kpis.machineUtilization >= 75 ? 'Óptimo' : 'Bajo objetivo'}
                </Badge>
              </div>
              <Progress value={kpis.machineUtilization} className="mt-3 h-1" />
            </CardContent>
          </Card>

          {/* Learning & Growth Perspective */}
          <Card className="border-l-4 border-l-orange-500 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Eficiencia del Personal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-3xl font-bold text-foreground">{kpis.workforceEfficiency}%</div>
                  <p className="text-xs text-muted-foreground mt-1">Utilización de habilidades</p>
                </div>
                <div className={`flex items-center text-sm ${
                  kpis.workforceEfficiency >= 85 ? 'text-green-500'
                  : kpis.workforceEfficiency >= 70 ? 'text-yellow-500' : 'text-red-500'
                }`}>
                  <Zap className="h-4 w-4" />
                  <span>{kpis.workforceEfficiency >= 85 ? 'Alta' : kpis.workforceEfficiency >= 70 ? 'Media' : 'Baja'}</span>
                </div>
              </div>
              <Progress value={kpis.workforceEfficiency} className="mt-3 h-1" />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Alert Banner */}
      {(kpis.criticalAlerts > 0 || kpis.pendingMaintenance > 0) && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-3">
            <div className="flex items-center gap-4">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  {kpis.pendingMaintenance} órdenes de mantenimiento pendientes requieren atención
                </p>
              </div>
              <Badge variant="destructive">{kpis.pendingMaintenance} Acciones</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* OT Pipeline Funnel */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-5 w-5 text-primary" />
              Flujo de Producción - Cadena de Valor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={otsByStatus} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                  <YAxis 
                    type="category" 
                    dataKey="status" 
                    width={120}
                    tickFormatter={formatStatus}
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => [value, 'OTs']}
                    labelFormatter={formatStatus}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {otsByStatus.map((entry) => (
                      <Cell key={entry.status} fill={statusColor(entry.status)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Machine Status Distribution */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PieChart className="h-5 w-5 text-primary" />
              Salud de Activos - Resumen TPM
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPie>
                  <Pie
                    data={machineStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="status"
                    label={({ status, count }) => `${machineStatusLabel(status)}: ${count}`}
                    labelLine={{ stroke: 'hsl(var(--muted-foreground))' }}
                  >
                    {machineStatus.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={machineColors[entry.status] || 'hsl(var(--muted))'}
                      />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                </RechartsPie>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 mt-2">
              {Object.entries(machineColors).map(([status, color]) => (
                <div key={status} className="flex items-center gap-1.5 text-xs">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-muted-foreground">{machineStatusLabel(status)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Department Performance - Lean Six Sigma */}
      <Card className="hover:shadow-lg transition-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-5 w-5 text-primary" />
            Matriz de Desempeño por Área
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {workerPerformance.map((dept) => (
              <div 
                key={dept.department}
                className="p-4 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-foreground capitalize">{dept.department}</h4>
                  <Badge variant={dept.avgEfficiency >= 80 ? 'default' : 'secondary'}>
                    {dept.totalWorkers} personas
                  </Badge>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Índice de Eficiencia</span>
                    <span className={`font-semibold ${
                      dept.avgEfficiency >= 85 ? 'text-green-500' : 
                      dept.avgEfficiency >= 70 ? 'text-yellow-500' : 'text-red-500'
                    }`}>
                      {dept.avgEfficiency}%
                    </span>
                  </div>
                  <Progress value={dept.avgEfficiency} className="h-2" />
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                    {dept.avgEfficiency >= 80 ? (
                      <>
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Sobre objetivo
                      </>
                    ) : (
                      <>
                        <Clock className="h-3 w-3 text-yellow-500" />
                        Oportunidad de mejora
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Insights - Executive Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground">Excelencia Operacional</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  El rendimiento de producción está {kpis.machineUtilization >= 70 ? 'cumpliendo' : 'por debajo de'} los objetivos. 
                  Máquinas activas: {kpis.runningMachines}/{kpis.totalMachines} ({kpis.machineUtilization}%)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <TrendingUp className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground">Trayectoria de Crecimiento</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  {kpis.activeOTs} órdenes activas en proceso con {kpis.onTimeDelivery}% de entregas a tiempo
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Zap className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground">Mejora Continua</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Iniciativas Kaizen impulsando {kpis.workforceEfficiency}% de eficiencia del personal entre áreas
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ExecutiveOverview;
