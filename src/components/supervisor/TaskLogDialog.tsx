'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { Slider } from '@/components/ui/slider';

interface TaskLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerId: string | null;
  jobId?: string;
  otId?: string;
  onSuccess?: () => void;
}

const TaskLogDialog = ({ open, onOpenChange, workerId, jobId, otId, onSuccess }: TaskLogDialogProps) => {
  const { t } = useLanguage();
  const [workerName, setWorkerName] = useState('');
  const [formData, setFormData] = useState({
    task_type: 'detachment',
    time_spent_minutes: 30,
    performance_rating: 75,
    notes: '',
  });

  useEffect(() => {
    if (workerId && open) {
      fetchWorkerName();
    }
  }, [workerId, open]);

  const fetchWorkerName = async () => {
    if (!workerId) return;
    
    const { data, error } = await supabase
      .from('workers' as any)
      .select('name')
      .eq('id', workerId)
      .maybeSingle();
    
    if (!error && data && 'name' in data) {
      setWorkerName((data as any).name);
    }
  };

  const handleSubmit = async () => {
    if (!workerId) return;

    const { error } = await supabase
      .from('task_logs' as any)
      .insert({
        worker_id: workerId,
        job_id: jobId,
        ot_id: otId,
        ...formData,
      } as any);

    if (error) {
      toast.error('Error logging task');
    } else {
      toast.success('Task logged successfully');
      onSuccess?.();
      resetForm();
    }
  };

  const resetForm = () => {
    setFormData({
      task_type: 'detachment',
      time_spent_minutes: 30,
      performance_rating: 75,
      notes: '',
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('logTask')}</DialogTitle>
          <DialogDescription>
            {workerName && `${t('worker')}: ${workerName}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task_type">{t('taskType')}</Label>
            <Select 
              value={formData.task_type} 
              onValueChange={(value) => setFormData({ ...formData, task_type: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="detachment">{t('detachment')}</SelectItem>
                <SelectItem value="revision">{t('revision')}</SelectItem>
                <SelectItem value="packaging">{t('packaging')}</SelectItem>
                <SelectItem value="printing">{t('printing')}</SelectItem>
                <SelectItem value="cutting">{t('cutting')}</SelectItem>
                <SelectItem value="delivery">{t('delivery')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="time_spent">{t('timeSpent')}</Label>
            <Input
              id="time_spent"
              type="number"
              min="0"
              value={formData.time_spent_minutes}
              onChange={(e) => setFormData({ ...formData, time_spent_minutes: parseInt(e.target.value) || 0 })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rating">
              {t('rating')}: {formData.performance_rating}/100
            </Label>
            <Slider
              value={[formData.performance_rating]}
              onValueChange={([value]) => setFormData({ ...formData, performance_rating: value })}
              min={0}
              max={100}
              step={5}
              className="py-4"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t('notes')}</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetForm}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} className="bg-supervisor hover:bg-supervisor/90">
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TaskLogDialog;
