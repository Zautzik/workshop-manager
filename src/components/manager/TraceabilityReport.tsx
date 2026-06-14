'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, Package, FileText, ShieldCheck } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

const TraceabilityReport = () => {
  const { t } = useLanguage();
  const [otNumber, setOtNumber] = useState('');
  const { data: traceData, refetch, isFetching } = useQuery<any>({
    queryKey: ['traceability', otNumber],
    queryFn: async () => {
      const { data: otData, error: otError } = await supabase
        .from('ot' as any)
        .select('*, jobs(*, batches(*, purchases(*)))')
        .eq('ot_number', otNumber)
        .single();

      if (otError || !otData) {
        throw new Error('OT not found');
      }

      return otData as any;
    },
    enabled: false,
    retry: false,
  });

  const handleSearch = async () => {
    if (!otNumber.trim()) {
      toast.error('Please enter an OT number');
      return;
    }

    try {
      await refetch();
    } catch (error) {
      toast.error('OT not found');
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            {t('traceabilityReport')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="otNumber">{t('otNumber')}</Label>
              <Input
                id="otNumber"
                value={otNumber}
                onChange={(e) => setOtNumber(e.target.value)}
                placeholder="Ingrese el número de OT (ej., OT-2025-001)"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={isFetching}
              className="self-end bg-primary hover:bg-primary/90"
            >
              <Search className="mr-2 h-4 w-4" />
              {t('search')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {traceData && (
        <div className="space-y-4">
          <Card className="border-supervisor/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-supervisor" />
                Work Order: {traceData.ot_number}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{traceData.description}</p>
              <div className="mt-4 flex items-center gap-4 text-sm">
                <span className="font-medium">{t('status')}:</span>
                <span className="px-3 py-1 rounded-full bg-supervisor/20 text-supervisor">
                  {t(traceData.status)}
                </span>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {traceData.jobs?.map((job: any, idx: number) => (
              <Card key={job.id} className="border-primary/20">
                <CardHeader>
                  <CardTitle className="text-base">Job #{idx + 1}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm">{job.description}</p>

                  {job.batches && (
                    <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2 font-medium">
                        <Package className="h-4 w-4 text-primary" />
                        Batch: {job.batches.batch_number}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Paper Type: {job.batches.paper_type}
                      </p>

                      {job.batches.purchases && (
                        <div className="mt-3 pt-3 border-t space-y-1">
                          <div className="flex items-center gap-2 font-medium text-sm">
                            <ShieldCheck className="h-4 w-4 text-supervisor" />
                            {t('supplier')}: {job.batches.purchases.supplier}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Date: {new Date(job.batches.purchases.date).toLocaleDateString()}
                          </p>
                          {job.batches.purchases.certification_details && (
                            <div className="mt-2 p-2 bg-supervisor/10 rounded text-xs">
                              <strong>Certifications:</strong>
                              <p className="mt-1">{job.batches.purchases.certification_details}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {job.cost && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">{t('totalCost')}:</span>
                      <span className="ml-2 font-bold text-manager">
                        ${job.cost.toFixed(2)}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TraceabilityReport;
