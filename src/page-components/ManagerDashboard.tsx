'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMachines, useJobs } from '@/hooks/use-queries';
import { TrendingUp, CheckCircle, Clock, Package } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CostReport from '@/components/manager/CostReport';
import TraceabilityReport from '@/components/manager/TraceabilityReport';
import WorkerStatsReport from '@/components/manager/WorkerStatsReport';

const ManagerDashboard = () => {
  const { t } = useLanguage();
  const { data: jobs = [] } = useJobs();
  const { data: machines = [] } = useMachines();

  const stats = useMemo(() => {
    const completed = jobs.filter((j: any) => j.status === 'completed' || j.status === 'delivered').length;
    const pending = jobs.filter((j: any) => j.status === 'pending').length;
    const inProgress = jobs.filter((j: any) => j.status === 'in_progress').length;
    return { total: jobs.length, completed, pending, inProgress };
  }, [jobs]);

  const efficiencyRate = stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(1) : '0';

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">KPIs & Reportes</h1>
        <p className="text-sm text-muted-foreground mt-1">Analítica y rendimiento operativo</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/50 hover:shadow-md transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('totalJobs')}
            </CardTitle>
            <div className="p-2 rounded-lg bg-primary/10">
              <Package className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.total}</div>
          </CardContent>
        </Card>

        <Card className="border-border/50 hover:shadow-md transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('completedJobs')}
            </CardTitle>
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.completed}</div>
          </CardContent>
        </Card>

        <Card className="border-border/50 hover:shadow-md transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('pendingJobs')}
            </CardTitle>
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.pending}</div>
          </CardContent>
        </Card>

        <Card className="border-border/50 hover:shadow-md transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('efficiency')}
            </CardTitle>
            <div className="p-2 rounded-lg bg-violet-500/10">
              <TrendingUp className="h-4 w-4 text-violet-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{efficiencyRate}%</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">{t('overview')}</TabsTrigger>
          <TabsTrigger value="costs">{t('costReport')}</TabsTrigger>
          <TabsTrigger value="workers">{t('workerStats')}</TabsTrigger>
          <TabsTrigger value="traceability">{t('traceabilityReport')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('machines')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {machines.map(machine => (
                    <div
                      key={machine.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div>
                        <p className="font-medium">{machine.name}</p>
                        <p className="text-sm text-muted-foreground">{t(machine.type)}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        machine.status === 'running' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                        machine.status === 'maintenance' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {t(machine.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('jobs')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {jobs.map(job => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex-1">
                        <p className="font-medium truncate">{job.description}</p>
                        <p className="text-sm text-muted-foreground">
                          {job.machines?.name || t('machine')}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        job.status === 'completed' || job.status === 'delivered' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                        job.status === 'in_progress' ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' :
                        'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                      }`}>
                        {t(job.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="costs">
          <CostReport />
        </TabsContent>

        <TabsContent value="workers">
          <WorkerStatsReport />
        </TabsContent>

        <TabsContent value="traceability">
          <TraceabilityReport />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ManagerDashboard;