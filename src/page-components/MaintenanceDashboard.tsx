'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Clock, AlertCircle, CheckCircle, Wrench, FileText, BarChart3, ClipboardList, BookOpen, Cpu } from 'lucide-react';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useMaintenanceStats, useMaintenanceWorkOrders } from '@/hooks/use-maintenance-queries';
import MaintenanceChecklistEditor from '@/components/maintenance/MaintenanceChecklistEditor';
import WorkOrderExecution from '@/components/maintenance/WorkOrderExecution';
import WeeklyProgramLog from '@/components/maintenance/WeeklyProgramLog';
import MaintenanceProgramView from '@/components/maintenance/MaintenanceProgramView';
import { MachineManagementPanel } from '@/components/maintenance/MachineManagementPanel';

interface WorkOrderStats {
  pending: number;
  in_progress: number;
  completed: number;
  total: number;
}

export default function MaintenanceDashboard() {
  const { role } = useAuth();
  const { toast } = useToast();
  const { data: stats, isLoading, isError } = useMaintenanceStats();
  const safeStats: WorkOrderStats = stats || { pending: 0, in_progress: 0, completed: 0, total: 0 };

  useEffect(() => {
    if (isError) {
      toast({
        title: 'Error',
        description: 'Failed to fetch statistics',
        variant: 'destructive',
      });
    }
  }, [isError, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-3 text-sm text-muted-foreground">Cargando mantenimiento...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Wrench className="h-6 w-6" />
          Máquinas &amp; Mantenimiento
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Registro de máquinas, programas de mantenimiento y órdenes de trabajo</p>
      </div>

      {/* Stats Cards */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-5 border-border/50 hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Pendientes</p>
              <p className="text-3xl font-bold text-amber-500">{safeStats.pending}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-amber-500/10">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border-border/50 hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">En Progreso</p>
              <p className="text-3xl font-bold text-blue-500">{safeStats.in_progress}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-blue-500/10">
              <AlertCircle className="h-5 w-5 text-blue-500" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border-border/50 hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Completadas</p>
              <p className="text-3xl font-bold text-emerald-500">{safeStats.completed}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-500/10">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border-border/50 hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-3xl font-bold text-foreground">{safeStats.total}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
          </div>
        </Card>
      </section>

      {/* Main Content Tabs */}
      <Tabs defaultValue="maquinas" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="maquinas" className="flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            Máquinas
          </TabsTrigger>
          <TabsTrigger value="workorders" className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Órdenes
          </TabsTrigger>
          <TabsTrigger value="registro" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Registro Semanal
          </TabsTrigger>
          <TabsTrigger value="programas" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Programas
          </TabsTrigger>
          <TabsTrigger value="checklists" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Checklists
          </TabsTrigger>
          <TabsTrigger value="calendar" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Calendario
          </TabsTrigger>
        </TabsList>

        <TabsContent value="maquinas" className="mt-6">
          <MachineManagementPanel />
        </TabsContent>

        <TabsContent value="workorders" className="mt-6">
          <WorkOrderExecution />
        </TabsContent>

        <TabsContent value="registro" className="mt-6">
          <WeeklyProgramLog />
        </TabsContent>

        <TabsContent value="programas" className="mt-6">
          <MaintenanceProgramView />
        </TabsContent>

        <TabsContent value="checklists" className="mt-6">
          <MaintenanceChecklistEditor />
        </TabsContent>

        <TabsContent value="calendar" className="mt-6">
          <MaintenanceCalendar />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Simple Calendar Component
function MaintenanceCalendar() {
  const { data: workOrders = [] } = useMaintenanceWorkOrders();

  // Group by date
  const groupedByDate = workOrders.reduce((acc, wo) => {
    const date = new Date(wo.scheduled_date).toLocaleDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(wo);
    return acc;
  }, {} as Record<string, any[]>);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'in_progress': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'pending': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Maintenance Schedule</h2>
        <Badge variant="outline" className="text-muted-foreground">
          {workOrders.length} scheduled
        </Badge>
      </div>

      {Object.keys(groupedByDate).length === 0 ? (
        <Card className="p-12 border-border/40 bg-card/50 backdrop-blur">
          <div className="text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No maintenance scheduled</p>
            <p className="text-sm text-muted-foreground mt-2">
              Create work orders from the Checklists tab
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByDate).map(([date, orders]) => (
            <div key={date} className="space-y-3">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                {date}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(orders as any[]).map((order) => (
                  <Card key={order.id} className="p-4 border-border/40 bg-card/50 backdrop-blur">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{order.machines?.name}</p>
                        <p className="text-sm text-muted-foreground">{order.maintenance_checklists?.name}</p>
                      </div>
                      <Badge variant="outline" className={getStatusColor(order.status)}>
                        {order.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}