/**
 * Editor de checklists de mantenimiento: crear listas, agregar/editar/
 * reordenar sus ítems por arrastrar y soltar, y una vista previa imprimible.
 */
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useMaintenanceChecklists } from '@/hooks/use-maintenance-queries';
import { ChecklistsList } from './checklist-editor/ChecklistsList';
import { ChecklistEditorPanel } from './checklist-editor/ChecklistEditorPanel';
import { PreviewMode } from './checklist-editor/PreviewMode';
import { CreateChecklistDialog } from './checklist-editor/CreateChecklistDialog';
import { normalizeItem, type MaintenanceChecklist } from './checklist-editor/types';

const EMPTY_CHECKLISTS: any[] = [];

export default function MaintenanceChecklistEditor() {
  const [checklists, setChecklists] = useState<MaintenanceChecklist[]>([]);
  const [selectedChecklist, setSelectedChecklist] = useState<MaintenanceChecklist | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  const { data: rawChecklists = EMPTY_CHECKLISTS, isError } = useMaintenanceChecklists();

  useEffect(() => {
    if (isError) {
      toast.error('No se pudieron cargar los checklists');
    }
  }, [isError]);

  useEffect(() => {
    const mapped: MaintenanceChecklist[] = rawChecklists.map((row: any) => ({
      id: row.id,
      name: row.name,
      machineType: row.machine_type || row.machineType || '',
      maintenanceType: row.maintenance_type || row.maintenanceType || 'preventive',
      frequency: row.frequency ?? 'as_needed',
      items: Array.isArray(row.items) ? row.items.map(normalizeItem) : [],
      totalEstimatedTime: row.total_estimated_time ?? row.totalEstimatedTime ?? 0,
      createdAt: row.created_at ? new Date(row.created_at) : new Date(),
      updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
    }));
    setChecklists(mapped);
  }, [rawChecklists]);

  const [newChecklist, setNewChecklist] = useState<Partial<MaintenanceChecklist>>({
    name: '',
    machineType: '',
    maintenanceType: 'preventive',
    items: [],
  });

  const handleCreateChecklist = () => {
    if (!newChecklist.name?.trim() || !newChecklist.machineType?.trim()) {
      toast.error('Completa el nombre y el tipo de máquina');
      return;
    }

    const checklist: MaintenanceChecklist = {
      id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: newChecklist.name,
      machineType: newChecklist.machineType,
      maintenanceType: newChecklist.maintenanceType as any,
      frequency: 'as_needed',
      items: [],
      totalEstimatedTime: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setChecklists([...checklists, checklist]);
    setSelectedChecklist(checklist);
    setNewChecklist({
      name: '',
      machineType: '',
      maintenanceType: 'preventive',
      items: [],
    });
    setIsDialogOpen(false);
    toast.success('Checklist creado');
  };

  const handleSaveChecklist = async () => {
    if (!selectedChecklist?.items.length) {
      toast.error('Agrega al menos un ítem antes de guardar');
      return;
    }

    try {
      const isNew = !selectedChecklist.id || selectedChecklist.id.startsWith('temp-');

      const payload = {
        name: selectedChecklist.name,
        machineType: selectedChecklist.machineType,
        maintenanceType: selectedChecklist.maintenanceType,
        items: JSON.parse(JSON.stringify(selectedChecklist.items)),
        totalEstimatedTime: selectedChecklist.totalEstimatedTime,
      };

      if (isNew) {
        const res = await fetch('/api/maintenance/checklists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ...payload, frequency: 'as_needed' }),
        });

        const created = await res.json().catch(() => null);
        if (!res.ok || !created?.id) {
          throw new Error(created?.error || 'No se pudo guardar el checklist');
        }

        const savedChecklist = { ...selectedChecklist, id: created.id };
        // Replace the temp checklist with the saved one
        setChecklists((prev) =>
          prev.map((c) => (c.id === selectedChecklist.id ? savedChecklist : c))
        );
        setSelectedChecklist(savedChecklist);
      } else {
        const res = await fetch('/api/maintenance/checklists', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ id: selectedChecklist.id, ...payload }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || 'No se pudo guardar el checklist');
        }

        setChecklists((prev) =>
          prev.map((c) => (c.id === selectedChecklist.id ? selectedChecklist : c))
        );
      }

      toast.success('Checklist guardado');
    } catch (error) {
      console.error('Error saving checklist:', error);
      toast.error('No se pudo guardar el checklist');
    }
  };

  const handleDuplicateChecklist = (checklist: MaintenanceChecklist) => {
    const duplicated = {
      ...checklist,
      id: `temp-${Date.now()}`,
      name: `${checklist.name} (copia)`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setChecklists([...checklists, duplicated]);
    setSelectedChecklist(duplicated);
    toast.success('Checklist duplicado — presiona Guardar para conservarlo');
  };

  const handleDeleteChecklist = async (checklistId: string) => {
    try {
      // Remove from local state immediately for UX
      setChecklists((prev) => prev.filter((c) => c.id !== checklistId));

      // If it's a temp checklist, no need to delete from DB
      if (checklistId.startsWith('temp-')) {
        toast.success('Checklist eliminado');
        return;
      }

      const res = await fetch(`/api/maintenance/checklists?id=${encodeURIComponent(checklistId)}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'No se pudo eliminar el checklist');
      }

      toast.success('Checklist eliminado');
    } catch (error) {
      // Restore the checklist if deletion fails
      const restoredChecklist = [...checklists].find(c => c.id === checklistId);
      if (restoredChecklist) {
        setChecklists((prev) => [...prev, restoredChecklist]);
      }
      toast.error('No se pudo eliminar el checklist: ' + (error instanceof Error ? error.message : 'Error desconocido'));
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Listas de verificación de mantenimiento</h1>
          <p className="text-muted-foreground mt-1">Cree y administre procedimientos de mantenimiento detallados</p>
        </div>
        <Button
          onClick={() => setIsDialogOpen(true)}
          className="bg-primary hover:bg-primary/90"
        >
          <Plus size={20} className="mr-2" />
          Nueva lista
        </Button>
      </div>

      {!selectedChecklist && (
        <ChecklistsList
          checklists={checklists}
          onSelect={setSelectedChecklist}
          onDuplicate={handleDuplicateChecklist}
          onDelete={handleDeleteChecklist}
          onCreateNew={() => setIsDialogOpen(true)}
        />
      )}

      {selectedChecklist && !isPreviewMode && (
        <ChecklistEditorPanel
          checklist={selectedChecklist}
          setChecklist={setSelectedChecklist}
          onBack={() => setSelectedChecklist(null)}
          onPreview={() => setIsPreviewMode(true)}
          onSave={handleSaveChecklist}
        />
      )}

      {selectedChecklist && isPreviewMode && (
        <PreviewMode
          checklist={selectedChecklist}
          onBack={() => setIsPreviewMode(false)}
          onSave={handleSaveChecklist}
        />
      )}

      <CreateChecklistDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        newChecklist={newChecklist}
        setNewChecklist={setNewChecklist}
        onCreate={handleCreateChecklist}
      />
    </div>
  );
}
