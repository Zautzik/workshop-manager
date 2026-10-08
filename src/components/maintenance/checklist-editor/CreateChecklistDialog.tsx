'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MaintenanceChecklist } from './types';

export function CreateChecklistDialog({
  open,
  onOpenChange,
  newChecklist,
  setNewChecklist,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newChecklist: Partial<MaintenanceChecklist>;
  setNewChecklist: (value: Partial<MaintenanceChecklist>) => void;
  onCreate: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear nueva lista de verificación de mantenimiento</DialogTitle>
          <DialogDescription>
            Configura un checklist nuevo para un equipo o máquina
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="checklist-name">Nombre del checklist *</Label>
            <Input
              id="checklist-name"
              placeholder="ej., Mantenimiento mensual de impresora offset"
              value={newChecklist.name || ''}
              onChange={(e) => setNewChecklist({ ...newChecklist, name: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="machine-type">Tipo de máquina o equipo *</Label>
            <Input
              id="machine-type"
              placeholder="ej., Impresora offset, guillotina, troqueladora"
              value={newChecklist.machineType || ''}
              onChange={(e) => setNewChecklist({ ...newChecklist, machineType: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="maintenance-type">Tipo de mantenimiento</Label>
            <Select
              value={newChecklist.maintenanceType || 'preventive'}
              onValueChange={(val) =>
                setNewChecklist({
                  ...newChecklist,
                  maintenanceType: val as any,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="preventive">Preventivo</SelectItem>
                <SelectItem value="corrective">Correctivo</SelectItem>
                <SelectItem value="emergency">Emergencia</SelectItem>
                <SelectItem value="inspection">Inspección</SelectItem>
                <SelectItem value="cleaning">Limpieza</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onCreate} className="bg-primary hover:bg-primary/90">
            Crear checklist
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
