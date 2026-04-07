'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMachines, useJobs } from '@/hooks/use-queries';
import { Plus, Package, FileText } from 'lucide-react';
import MachineList from '@/components/supervisor/MachineList';
import JobList from '@/components/supervisor/JobList';
import AddJobDialog from '@/components/supervisor/AddJobDialog';
import WorkerRoster from '@/components/supervisor/WorkerRoster';

const SupervisorDashboard = () => {
  const { t } = useLanguage();
  const [showAddJob, setShowAddJob] = useState(false);
  const { data: machines = [] } = useMachines();
  const { data: jobs = [] } = useJobs();

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('supervisorDashboard')}</h1>
        <p className="text-sm text-muted-foreground mt-1">Gestión de producción</p>
      </div>

      <WorkerRoster showActions={true} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {t('machines')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MachineList machines={machines} onUpdate={() => {}} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('jobs')}
          </CardTitle>
          <Button onClick={() => setShowAddJob(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            {t('addJob')}
          </Button>
        </CardHeader>
        <CardContent>
          <JobList jobs={jobs} machines={machines} onUpdate={() => {}} />
        </CardContent>
      </Card>

      <AddJobDialog
        open={showAddJob}
        onOpenChange={setShowAddJob}
        machines={machines}
        onJobAdded={() => {}}
      />
    </div>
  );
};

export default SupervisorDashboard;