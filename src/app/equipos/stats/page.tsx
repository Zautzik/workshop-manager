'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useMaintenanceStats } from '@/hooks/use-maintenance-queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, CheckCircle2, Clock, AlertTriangle, Activity } from 'lucide-react';
import { FleetAvailability } from '@/components/maintenance/FleetAvailability';

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div>
          <p className="text-3xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatsContent() {
  const { data: stats, isLoading } = useMaintenanceStats();

  const total = stats?.total ?? 0;
  const completionRate = total > 0 ? Math.round(((stats?.completed ?? 0) / total) * 100) : 0;

  // Outer structure is always rendered — no early return so the DOM layout
  // anchor never changes, eliminating the reflow on data arrival.
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-4 p-6">
                <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatCard icon={Activity}     label="Total de órdenes"  value={total}               color="bg-blue-500"   />
            <StatCard icon={Clock}        label="Pendientes"        value={stats!.pending}       color="bg-amber-500"  />
            <StatCard icon={BarChart3}    label="En curso"          value={stats!.in_progress}   color="bg-indigo-500" />
            <StatCard icon={CheckCircle2} label="Completadas"       value={stats!.completed}     color="bg-green-500"  />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />Tasa de cumplimiento
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-32" />
              <Skeleton className="h-3 w-full rounded-full" />
            </div>
          ) : (
            <>
              <div className="flex items-end gap-3">
                <span className="text-5xl font-bold">{completionRate}%</span>
                <span className="text-muted-foreground mb-1.5 text-sm">de órdenes completadas</span>
              </div>
              <div className="mt-3 h-3 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${completionRate}%` }} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <FleetAvailability />
    </div>
  );
}

export default function MaintenanceStatsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Estadísticas de Mantenimiento</h1>
          <p className="text-sm text-muted-foreground mt-1">KPIs y métricas de cumplimiento</p>
        </div>
        <StatsContent />
      </div>
    </ProtectedRoute>
  );
}
