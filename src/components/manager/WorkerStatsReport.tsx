'use client';
import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWorkerStats } from '@/hooks/use-operations-queries';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import WorkerCard from '../supervisor/WorkerCard';
import { Button } from '@/components/ui/button';
import { FileDown } from 'lucide-react';

const WorkerStatsReport = () => {
  const { t } = useLanguage();
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const { data: workers = [], isError } = useWorkerStats(departmentFilter);

  const safeWorkers = useMemo(() => {
    return workers.filter((worker: any) => worker?.id && worker?.name);
  }, [workers]);

  useEffect(() => {
    if (isError) {
      toast.error('Error loading worker stats');
    }
  }, [isError]);

  const calculateAverages = () => {
    if (safeWorkers.length === 0) return { avgEfficiency: 0, avgRating: 0, totalTasks: 0 };
    
    const avgEfficiency = safeWorkers.reduce((sum: number, w: any) => sum + (w.efficiency_score || 0), 0) / safeWorkers.length;
    const avgRating = safeWorkers.reduce((sum: number, w: any) => sum + (w.avg_rating || 0), 0) / safeWorkers.length;
    const totalTasks = safeWorkers.reduce((sum: number, w: any) => sum + (w.total_tasks || 0), 0);
    
    return {
      avgEfficiency: Math.round(avgEfficiency),
      avgRating: Math.round(avgRating),
      totalTasks,
    };
  };

  const stats = calculateAverages();

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-manager/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-manager">{t('efficiencyScore')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.avgEfficiency}%</div>
            <p className="text-xs text-muted-foreground mt-1">Average across all workers</p>
          </CardContent>
        </Card>

        <Card className="border-manager/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-manager">{t('rating')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.avgRating}/100</div>
            <p className="text-xs text-muted-foreground mt-1">Average performance rating</p>
          </CardContent>
        </Card>

        <Card className="border-manager/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-manager">{t('totalTasks')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalTasks}</div>
            <p className="text-xs text-muted-foreground mt-1">Completed across all workers</p>
          </CardContent>
        </Card>
      </div>

      {/* Worker Grid */}
      <Card className="border-manager/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-manager">{t('workerStats')}</CardTitle>
            <div className="flex gap-2">
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allWorkers')}</SelectItem>
                  <SelectItem value="press">{t('press')}</SelectItem>
                  <SelectItem value="manual_workshop">{t('manual_workshop')}</SelectItem>
                  <SelectItem value="deliveries">{t('deliveries')}</SelectItem>
                  <SelectItem value="pre_press">{t('pre_press')}</SelectItem>
                  <SelectItem value="administration">{t('administration')}</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon">
                <FileDown className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {safeWorkers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('noData')}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {safeWorkers.map((worker: any) => (
                <WorkerCard
                  key={worker.id}
                  worker={worker}
                  showActions={false}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WorkerStatsReport;
