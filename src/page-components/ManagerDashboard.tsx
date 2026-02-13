'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMachines, useJobs } from '@/hooks/use-queries';
import { LogOut, TrendingUp, CheckCircle, Clock, Package, DollarSign } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CostReport from '@/components/manager/CostReport';
import TraceabilityReport from '@/components/manager/TraceabilityReport';
import WorkerStatsReport from '@/components/manager/WorkerStatsReport';
import gonsaLogo from '@/assets/gonsa-logo.jpg';

const ManagerDashboard = () => {
  const { user, role, signOut } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const { data: jobs = [] } = useJobs();
  const { data: machines = [] } = useMachines();

  const stats = useMemo(() => {
    const completed = jobs.filter((j: any) => j.status === 'completed' || j.status === 'delivered').length;
    const pending = jobs.filter((j: any) => j.status === 'pending').length;
    const inProgress = jobs.filter((j: any) => j.status === 'in_progress').length;
    return { total: jobs.length, completed, pending, inProgress };
  }, [jobs]);

  useEffect(() => {
    // Redirect only if NOT authenticated at all
    if (!user) {
      router.push('/login');
    }
  }, [user, router]);

  const handleLogout = async () => {
    await signOut();
    router.push('/');
  };

  const efficiencyRate = stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(1) : '0';

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-manager/5 to-background">
      <header className="border-b border-manager/20 shadow-lg sticky top-0 z-50 backdrop-blur-sm bg-card/95">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/gonsa-logo.jpg" alt="Gonsa" className="h-12" />
            <div>
              <h1 className="text-2xl font-bold text-manager">{t('managerDashboard')}</h1>
              <p className="text-xs text-muted-foreground">Analytics & Reports</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => router.push('/financial')}
              variant="outline"
              className="border-primary/30 text-primary hover:bg-primary/10"
            >
              <DollarSign className="mr-2 h-4 w-4" />
              Financial Report
            </Button>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="border-manager/30 text-manager hover:bg-manager/10"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t('logout')}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-manager/20 hover:border-manager/40 transition-all hover:shadow-lg hover:-translate-y-1 duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('totalJobs')}
              </CardTitle>
              <div className="p-2 rounded-lg bg-manager/10">
                <Package className="h-5 w-5 text-manager" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-manager">{stats.total}</div>
              <p className="text-xs text-muted-foreground mt-1">All time</p>
            </CardContent>
          </Card>

          <Card className="border-supervisor/20 hover:border-supervisor/40 transition-all hover:shadow-lg hover:-translate-y-1 duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('completedJobs')}
              </CardTitle>
              <div className="p-2 rounded-lg bg-supervisor/10">
                <CheckCircle className="h-5 w-5 text-supervisor" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-supervisor">{stats.completed}</div>
              <p className="text-xs text-muted-foreground mt-1">Successfully delivered</p>
            </CardContent>
          </Card>

          <Card className="border-accent/20 hover:border-accent/40 transition-all hover:shadow-lg hover:-translate-y-1 duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('pendingJobs')}
              </CardTitle>
              <div className="p-2 rounded-lg bg-accent/10">
                <Clock className="h-5 w-5 text-accent" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-accent">{stats.pending}</div>
              <p className="text-xs text-muted-foreground mt-1">Awaiting start</p>
            </CardContent>
          </Card>

          <Card className="border-primary/20 hover:border-primary/40 transition-all hover:shadow-lg hover:-translate-y-1 duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('efficiency')}
              </CardTitle>
              <div className="p-2 rounded-lg bg-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-primary">{efficiencyRate}%</div>
              <p className="text-xs text-muted-foreground mt-1">Completion rate</p>
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

          <TabsContent value="overview" className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card className="border-manager/20">
                <CardHeader>
                  <CardTitle className="text-manager">{t('machines')}</CardTitle>
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
                          machine.status === 'running' ? 'bg-supervisor/20 text-supervisor' :
                          machine.status === 'maintenance' ? 'bg-accent/20 text-accent' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {t(machine.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-manager/20">
                <CardHeader>
                  <CardTitle className="text-manager">{t('jobs')}</CardTitle>
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
                          job.status === 'completed' || job.status === 'delivered' ? 'bg-supervisor/20 text-supervisor' :
                          job.status === 'in_progress' ? 'bg-primary/20 text-primary' :
                          'bg-accent/20 text-accent'
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
      </main>
    </div>
  );
};

export default ManagerDashboard;