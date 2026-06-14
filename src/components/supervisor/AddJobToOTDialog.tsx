'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useBatchesAvailable, useMachines, useWorkers } from '@/hooks/use-operations-queries';

interface AddJobToOTDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  otId: string;
  onJobAdded: () => void;
}

const AddJobToOTDialog = ({ open, onOpenChange, otId, onJobAdded }: AddJobToOTDialogProps) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [machineId, setMachineId] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [batchId, setBatchId] = useState('');
  const { data: machines = [] } = useMachines();
  const { data: workers = [] } = useWorkers();
  const { data: batches = [] } = useBatchesAvailable() as { data: any[] };
  const [loading, setLoading] = useState(false);

  const calculateCost = async (batchId: string, machineId: string) => {
    // Dummy rates: $0.1/sheet, $10/hour labor, $5/hour machine
    const materialCost = 10 * 0.1; // 10 sheets as default
    const laborCost = 2 * 10; // 2 hours labor
    const machineCost = 2 * 5; // 2 hours machine
    return materialCost + laborCost + machineCost;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Calculate cost
    const cost = await calculateCost(batchId, machineId);

    // Deduct batch quantity
    if (batchId) {
      const batch = batches.find(b => b.id === batchId);
      if (batch) {
        await supabase
          .from('batches' as any)
          .update({ quantity_remaining: batch.quantity_remaining - 10 })
          .eq('id', batchId);
      }
    }

    // Insert job
    const { error } = await supabase
      .from('jobs')
      .insert({
        description,
        assigned_machine_id: machineId || null,
        assigned_employee_id: workerId || null,
        batch_id: batchId || null,
        ot_id: otId,
        cost,
        created_by: user?.id,
      });

    if (error) {
      toast.error('Error adding job');
    } else {
      toast.success('Job added successfully with cost calculated');
      resetForm();
      onOpenChange(false);
      onJobAdded();
    }

    setLoading(false);
  };

  const resetForm = () => {
    setDescription('');
    setMachineId('');
    setWorkerId('');
    setBatchId('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('addJob')}</DialogTitle>
          <DialogDescription>
            Add a new job with machine, worker, and batch assignment
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">{t('description')}</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              placeholder="Ingrese la descripción del trabajo"
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="machine">{t('machine')}</Label>
              <Select value={machineId} onValueChange={setMachineId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar máquina" />
                </SelectTrigger>
                <SelectContent>
                  {machines.map(machine => (
                    <SelectItem key={machine.id} value={machine.id}>
                      {machine.name} - {t(machine.type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="worker">{t('worker')}</Label>
              <Select value={workerId} onValueChange={setWorkerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar trabajador" />
                </SelectTrigger>
                <SelectContent>
                  {workers.map(worker => (
                    <SelectItem key={worker.id} value={worker.id}>
                      {worker.name} - {t(worker.department)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="batch">{t('batch')}</Label>
            <Select value={batchId} onValueChange={setBatchId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar lote" />
              </SelectTrigger>
              <SelectContent>
                {batches.map(batch => (
                  <SelectItem key={batch.id} value={batch.id}>
                    {batch.batch_number} - {batch.paper_type} ({batch.quantity_remaining} remaining)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-muted p-4 rounded-lg">
            <p className="text-sm text-muted-foreground">
              Cost will be auto-calculated based on materials, labor, and machine hours
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              className="bg-supervisor hover:bg-supervisor/90"
              disabled={loading}
            >
              {loading ? '...' : t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddJobToOTDialog;
