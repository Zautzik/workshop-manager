'use client';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileDown, DollarSign } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const CostReport = () => {
  const { t } = useLanguage();
  const [stats, setStats] = useState({
    totalCost: 0,
    materialCost: 0,
    laborCost: 0,
    machineCost: 0,
    jobCount: 0,
  });
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    fetchCostData();
  }, []);

  const fetchCostData = async () => {
    const { data, error } = await supabase
      .from('jobs')
      .select('*, ot(ot_number), machines(name), workers(name), batches(paper_type)') as any;

    if (error) {
      toast.error('Error loading cost data');
      return;
    }

    setJobs(data || []);

    const totalCost = data?.reduce((sum, job) => sum + (job.cost || 0), 0) || 0;
    // Mock breakdown (in real app, store separately)
    const materialCost = totalCost * 0.3;
    const laborCost = totalCost * 0.5;
    const machineCost = totalCost * 0.2;

    setStats({
      totalCost,
      materialCost,
      laborCost,
      machineCost,
      jobCount: data?.length || 0,
    });
  };

  const exportToPDF = () => {
    toast.success('PDF export functionality would be implemented here');
    // In production, use jsPDF or similar library
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-manager">{t('costReport')}</h2>
        <Button onClick={exportToPDF} variant="outline">
          <FileDown className="mr-2 h-4 w-4" />
          {t('exportPDF')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-manager/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              {t('totalCost')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-manager">${stats.totalCost.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats.jobCount} jobs</p>
          </CardContent>
        </Card>

        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('materialCost')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">${stats.materialCost.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">30% of total</p>
          </CardContent>
        </Card>

        <Card className="border-supervisor/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('laborCost')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-supervisor">${stats.laborCost.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">50% of total</p>
          </CardContent>
        </Card>

        <Card className="border-accent/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('machineCost')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-accent">${stats.machineCost.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">20% of total</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-manager/20">
        <CardHeader>
          <CardTitle>{t('costBreakdown')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4 font-medium">OT</th>
                  <th className="text-left py-2 px-4 font-medium">{t('description')}</th>
                  <th className="text-left py-2 px-4 font-medium">{t('machine')}</th>
                  <th className="text-right py-2 px-4 font-medium">{t('totalCost')}</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-4">{job.ot?.ot_number || '-'}</td>
                    <td className="py-2 px-4">{job.description}</td>
                    <td className="py-2 px-4">{job.machines?.name || '-'}</td>
                    <td className="py-2 px-4 text-right font-bold text-manager">
                      ${(job.cost || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CostReport;
