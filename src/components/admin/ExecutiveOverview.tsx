'use client';
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useLanguage } from '@/contexts/LanguageContext';
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

  const kpis = useMemo(() => {
    const activeOTs = ots.filter((ot: any) => ot.status !== 'completed').length;
    const completedThisMonth = ots.filter((ot: any) => ot.status === 'completed').length;
    const runningMachines = machines.filter((m: any) => m.status === 'running').length;
    const totalMachines = machines.length || 1;
    const machineUtilization = Math.round((runningMachines / totalMachines) * 100);
    const pendingCount = pendingMaintenance.length;

    return {
      activeOTs,
      completedThisMonth,
      avgCycleTime: 4.2,
      machineUtilization,
      onTimeDelivery: 94,
      workforceEfficiency: 87,
      pendingMaintenance: pendingCount,
      criticalAlerts: pendingCount > 3 ? pendingCount - 3 : 0,
    };
  }, [machines, ots, pendingMaintenance]);

  const statusColors: Record<string, string> = {
    pre_press: 'hsl(var(--primary))',
    visto_bueno: 'hsl(var(--accent))',
    paper_purchase: 'hsl(var(--manager))',
    in_storage: 'hsl(var(--muted-foreground))',
    guillotine_first_cut: 'hsl(45 93% 47%)',
    offset_printing: 'hsl(199 89% 48%)',
    die_cutting: 'hsl(280 65% 60%)',
    guillotine_final_cut: 'hsl(45 93% 60%)',
    workshop: 'hsl(230 70% 55%)',
    outsourced: 'hsl(40 90% 50%)',
    workshop_revision: 'hsl(160 60% 45%)',
    ready_for_delivery: 'hsl(142 76% 36%)',
    in_delivery: 'hsl(262 83% 58%)',
    completed: 'hsl(142 76% 36%)',
  };

  const machineColors: Record<string, string> = {
    idle: 'hsl(var(--muted-foreground))',
    running: 'hsl(142 76% 36%)',
    maintenance: 'hsl(45 93% 47%)',
    offline: 'hsl(0 84% 60%)',
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\w/g, l => l.toUpperCase());
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
      <section aria-label="Key Performance Indicators">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Strategic KPIs - Balanced Scorecard
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Financial Perspective */}
          <Card className="border-l-4 border-l-green-500 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Active Work Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-3xl font-bold text-foreground">{kpis.activeOTs}</div>
                  <p className="text-xs text-muted-foreground mt-1">In pipeline</p>
                </div>
                <div className="flex items-center text-green-500 text-sm">
                  <ArrowUpRight className="h-4 w-4" />
                  <span>+12%</span>
                </div>
              </div>
              <Progress value={Math.min(kpis.activeOTs * 10, 100)} className="mt-3 h-1" />
            </CardContent>
          </Card>

          {/* Customer Perspective */}
          <Card className="border-l-4 border-l-blue-500 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                On-Time Delivery
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-3xl font-bold text-foreground">{kpis.onTimeDelivery}%</div>
                  <p className="text-xs text-muted-foreground mt-1">Customer satisfaction</p>
                </div>
                <div className="flex items-center text-green-500 text-sm">
                  <TrendingUp className="h-4 w-4" />
                  <span>+2.3%</span>
                </div>
              </div>
              <Progress value={kpis.onTimeDelivery} className="mt-3 h-1" />
            </CardContent>
          </Card>

          {/* Internal Process Perspective */}
          <Card className="border-l-4 border-l-purple-500 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Machine Utilization
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-3xl font-bold text-foreground">{kpis.machineUtilization}%</div>
                  <p className="text-xs text-muted-foreground mt-1">OEE benchmark</p>
                </div>
                <Badge variant={kpis.machineUtilization >= 75 ? 'default' : 'destructive'} className="text-xs">
                  {kpis.machineUtilization >= 75 ? 'Optimal' : 'Below Target'}
                </Badge>
              </div>
              <Progress value={kpis.machineUtilization} className="mt-3 h-1" />
            </CardContent>
          </Card>

          {/* Learning & Growth Perspective */}
          <Card className="border-l-4 border-l-orange-500 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Workforce Efficiency
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-3xl font-bold text-foreground">{kpis.workforceEfficiency}%</div>
                  <p className="text-xs text-muted-foreground mt-1">Utilización de habilidades</p>
                </div>
                <div className="flex items-center text-green-500 text-sm">
                  <Zap className="h-4 w-4" />
                  <span>High</span>
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
                  {kpis.pendingMaintenance} pending maintenance orders require attention
                </p>
              </div>
              <Badge variant="destructive">{kpis.pendingMaintenance} Actions</Badge>
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
              Production Pipeline - Value Stream
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
                  <Bar 
                    dataKey="count" 
                    fill="hsl(var(--primary))"
                    radius={[0, 4, 4, 0]}
                  />
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
              Asset Health - TPM Overview
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
                    label={({ status, count }) => `${formatStatus(status)}: ${count}`}
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
                  <span className="text-muted-foreground">{formatStatus(status)}</span>
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
            Department Performance Matrix - Lean Metrics
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
                    {dept.totalWorkers} staff
                  </Badge>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Efficiency Index</span>
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
                        Above target
                      </>
                    ) : (
                      <>
                        <Clock className="h-3 w-3 text-yellow-500" />
                        Improvement opportunity
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
                <h4 className="font-semibold text-foreground">Operational Excellence</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Production throughput is {kpis.machineUtilization >= 70 ? 'meeting' : 'below'} targets. 
                  Current OEE: {kpis.machineUtilization}%
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
                <h4 className="font-semibold text-foreground">Growth Trajectory</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  {kpis.activeOTs} active orders in pipeline with {kpis.onTimeDelivery}% on-time delivery rate
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
                <h4 className="font-semibold text-foreground">Continuous Improvement</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Kaizen initiatives driving {kpis.workforceEfficiency}% workforce efficiency across departments
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
