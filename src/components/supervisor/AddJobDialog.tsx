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

interface AddJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machines: any[];
  onJobAdded: () => void;
}

const AddJobDialog = ({ open, onOpenChange, machines, onJobAdded }: AddJobDialogProps) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [machineId, setMachineId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase
      .from('jobs')
      .insert({
        description,
        assigned_machine_id: machineId || null,
        created_by: user?.id,
      });

    if (error) {
      toast.error('Error adding job');
    } else {
      toast.success('Job added successfully');
      setDescription('');
      setMachineId('');
      onOpenChange(false);
      onJobAdded();
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('addJob')}</DialogTitle>
          <DialogDescription>
            Add a new job to the production queue
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
          <div className="space-y-2">
            <Label htmlFor="machine">{t('machine')} (Optional)</Label>
            <Select value={machineId} onValueChange={setMachineId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar una máquina" />
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

export default AddJobDialog;
