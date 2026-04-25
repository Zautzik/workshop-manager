'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useWorkers } from '@/hooks/use-operations-queries';

interface WorkersManagementProps {
  onUpdate: () => void;
}

const WorkersManagement = ({ onUpdate }: WorkersManagementProps) => {
  const { t } = useLanguage();
  const { data: workers = [], refetch: refetchWorkers } = useWorkers();
  const [showDialog, setShowDialog] = useState(false);
  const [editingWorker, setEditingWorker] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    department: 'press',
  });

  const handleSubmit = async () => {
    if (editingWorker) {
      const response = await fetch(`/api/workers/${editingWorker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        toast.error(errorBody?.error || 'Error updating worker');
      } else {
        toast.success('Worker updated successfully');
        refetchWorkers();
        onUpdate();
        resetForm();
      }
    } else {
      const response = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        toast.error(errorBody?.error || 'Error creating worker');
      } else {
        toast.success('Worker created successfully');
        refetchWorkers();
        onUpdate();
        resetForm();
      }
    }
  };

  const handleDelete = async (workerId: string) => {
    if (!confirm(t('confirmDelete'))) return;

    const response = await fetch(`/api/workers/${workerId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      toast.error(errorBody?.error || 'Error deleting worker');
    } else {
      toast.success('Worker deleted successfully');
      refetchWorkers();
      onUpdate();
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      department: 'press',
    });
    setEditingWorker(null);
    setShowDialog(false);
  };

  const openEditDialog = (worker: any) => {
    setEditingWorker(worker);
    setFormData({
      name: worker.name,
      department: worker.department,
    });
    setShowDialog(true);
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-primary">{t('workersManagement')}</CardTitle>
        <Button onClick={() => setShowDialog(true)} className="bg-primary hover:bg-primary/90">
          <Plus className="mr-2 h-4 w-4" />
          {t('addWorker')}
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('name')}</TableHead>
              <TableHead>{t('department')}</TableHead>
              <TableHead>{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workers.map((worker) => (
              <TableRow key={worker.id}>
                <TableCell>{worker.name}</TableCell>
                <TableCell>{t(worker.department)}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => openEditDialog(worker)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDelete(worker.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingWorker ? t('editWorker') : t('addWorker')}
            </DialogTitle>
            <DialogDescription>
              {editingWorker ? t('editWorkerDescription') : t('addWorkerDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('name')}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">{t('department')}</Label>
              <Select value={formData.department} onValueChange={(value) => setFormData({ ...formData, department: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="press">{t('press')}</SelectItem>
                  <SelectItem value="manual_workshop">{t('manual_workshop')}</SelectItem>
                  <SelectItem value="deliveries">{t('deliveries')}</SelectItem>
                  <SelectItem value="pre_press">{t('pre_press')}</SelectItem>
                  <SelectItem value="administration">{t('administration')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSubmit} className="bg-primary hover:bg-primary/90">
              {editingWorker ? t('update') : t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default WorkersManagement;
