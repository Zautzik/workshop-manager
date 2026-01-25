'use client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface JobListProps {
  jobs: any[];
  machines: any[];
  onUpdate: () => void;
}

const JobList = ({ jobs, machines, onUpdate }: JobListProps) => {
  const { t } = useLanguage();

  const updateJobStatus = async (jobId: string, status: string) => {
    const { error } = await supabase
      .from('jobs')
      .update({ status: status as any })
      .eq('id', jobId);

    if (error) {
      toast.error('Error updating job status');
    } else {
      toast.success('Job status updated');
      onUpdate();
    }
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('description')}</TableHead>
            <TableHead>{t('machine')}</TableHead>
            <TableHead>{t('status')}</TableHead>
            <TableHead>{t('createdAt')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map(job => (
            <TableRow key={job.id}>
              <TableCell className="font-medium">{job.description}</TableCell>
              <TableCell>{job.machines?.name || '-'}</TableCell>
              <TableCell>
                <Select
                  value={job.status}
                  onValueChange={(value) => updateJobStatus(job.id, value)}
                >
                  <SelectTrigger className="w-40 border-supervisor/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{t('pending')}</SelectItem>
                    <SelectItem value="in_progress">{t('in_progress')}</SelectItem>
                    <SelectItem value="completed">{t('completed')}</SelectItem>
                    <SelectItem value="delivered">{t('delivered')}</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {format(new Date(job.created_at), 'MMM dd, yyyy HH:mm')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default JobList;
