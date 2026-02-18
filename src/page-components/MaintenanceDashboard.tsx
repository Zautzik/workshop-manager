'use client';

import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Clock, AlertCircle, CheckCircle, Wrench, FileText, ArrowLeft, BarChart3 } from 'lucide-react';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useMaintenanceStats, useMaintenanceWorkOrders } from '@/hooks/use-queries';
import MaintenanceChecklistEditor from '@/components/maintenance/MaintenanceChecklistEditor';
import WorkOrderExecution from '@/components/maintenance/WorkOrderExecution';

interface WorkOrderStats {
  pending: number;
  in_progress: number;
  completed: number;
  total: number;
}

export default function MaintenanceDashboard() {
  const { role } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
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
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading maintenance module...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background">
      {/* Header */}
      <header className="border-b border-primary/20 shadow-lg sticky top-0 z-50 backdrop-blur-sm bg-card/95">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/gonsa-logo.jpg" alt="Gonsa Logo" className="h-12" />
            <div>
              <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
                <Wrench className="h-6 w-6" />
                Asset Maintenance
              </h1>
              <p className="text-xs text-muted-foreground">ISO 55000 Compliant Maintenance Management</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => router.push('/admin')}
              variant="outline"
              className="border-primary/30"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Admin
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Stats Cards */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-6 border-border/40 bg-card/50 backdrop-blur hover:border-yellow-500/40 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-3xl font-bold text-yellow-400">{safeStats.pending}</p>
                <p className="text-xs text-muted-foreground mt-1">Awaiting start</p>
              </div>
              <div className="p-3 rounded-lg bg-yellow-500/10">
                <Clock className="h-8 w-8 text-yellow-400" />
              </div>
            </div>
          </Card>

          <Card className="p-6 border-border/40 bg-card/50 backdrop-blur hover:border-blue-500/40 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In Progress</p>
                <p className="text-3xl font-bold text-blue-400">{safeStats.in_progress}</p>
                <p className="text-xs text-muted-foreground mt-1">Being executed</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/10">
                <AlertCircle className="h-8 w-8 text-blue-400" />
              </div>
            </div>
          </Card>

          <Card className="p-6 border-border/40 bg-card/50 backdrop-blur hover:border-green-500/40 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-3xl font-bold text-green-400">{safeStats.completed}</p>
                <p className="text-xs text-muted-foreground mt-1">This period</p>
              </div>
              <div className="p-3 rounded-lg bg-green-500/10">
                <CheckCircle className="h-8 w-8 text-green-400" />
              </div>
            </div>
          </Card>

          <Card className="p-6 border-border/40 bg-card/50 backdrop-blur hover:border-primary/40 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-3xl font-bold text-primary">{safeStats.total}</p>
                <p className="text-xs text-muted-foreground mt-1">All time</p>
              </div>
              <div className="p-3 rounded-lg bg-primary/10">
                <BarChart3 className="h-8 w-8 text-primary" />
              </div>
            </div>
          </Card>
        </section>

        {/* Main Content Tabs */}
        <Tabs defaultValue="workorders" className="w-full">
          <TabsList className="bg-card border border-border/40 grid w-full grid-cols-3">
            <TabsTrigger value="workorders" className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Work Orders
            </TabsTrigger>
            <TabsTrigger value="checklists" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Checklists
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Schedule
            </TabsTrigger>
          </TabsList>

          <TabsContent value="workorders" className="mt-6">
            <WorkOrderExecution />
          </TabsContent>

          <TabsContent value="checklists" className="mt-6">
            <MaintenanceChecklistEditor />
          </TabsContent>

          <TabsContent value="calendar" className="mt-6">
            <MaintenanceCalendar />
          </TabsContent>
        </Tabs>
      </main>
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