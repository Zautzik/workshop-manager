'use client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MachineListProps {
  machines: any[];
  onUpdate: () => void;
}

const MachineList = ({ machines, onUpdate }: MachineListProps) => {
  const { t } = useLanguage();

  const updateMachineStatus = async (machineId: string, status: string) => {
    const { error } = await supabase
      .from('machines')
      .update({ status: status as any })
      .eq('id', machineId);

    if (error) {
      toast.error('Error updating machine status');
    } else {
      toast.success('Machine status updated');
      onUpdate();
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {machines.map(machine => (
        <div
          key={machine.id}
          className="p-4 rounded-lg border border-supervisor/20 bg-card hover:shadow-md transition-shadow"
        >
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-lg">{machine.name}</h3>
              <p className="text-sm text-muted-foreground">{t(machine.type)}</p>
            </div>
            <Select
              value={machine.status}
              onValueChange={(value) => updateMachineStatus(machine.id, value)}
            >
              <SelectTrigger className="w-full border-supervisor/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="idle">{t('idle')}</SelectItem>
                <SelectItem value="running">{t('running')}</SelectItem>
                <SelectItem value="maintenance">{t('maintenance')}</SelectItem>
                <SelectItem value="offline">{t('offline')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MachineList;
