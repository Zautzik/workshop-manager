'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { AlertCircle, Clock, Eye, Save } from 'lucide-react';
import { toast } from 'sonner';
import { DraggableChecklistItem } from './DraggableChecklistItem';
import {
  groupItemsBySection, maintenanceTypeLabel, SIN_SECCION,
  type ChecklistItem, type MaintenanceChecklist,
} from './types';

export function ChecklistEditorPanel({
  checklist,
  setChecklist,
  onBack,
  onPreview,
  onSave,
}: {
  checklist: MaintenanceChecklist;
  setChecklist: Dispatch<SetStateAction<MaintenanceChecklist | null>>;
  onBack: () => void;
  onPreview: () => void;
  onSave: () => void;
}) {
  const [isEditingItem, setIsEditingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);

  const [newItem, setNewItem] = useState<Partial<ChecklistItem>>({
    title: '',
    description: '',
    estimatedTime: 30,
    priority: 'medium',
    toolsRequired: [],
  });

  const [toolInput, setToolInput] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleAddItem = () => {
    if (!newItem.title?.trim()) {
      toast.error('Ingresa un título para el ítem');
      return;
    }

    const item: ChecklistItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      step: (checklist?.items.length || 0) + 1,
      title: newItem.title,
      description: newItem.description || '',
      estimatedTime: newItem.estimatedTime || 30,
      priority: newItem.priority as any,
      toolsRequired: newItem.toolsRequired || [],
    };

    if (isEditingItem && editingItem) {
      const updatedItems = (checklist?.items || []).map((i) =>
        i.id === editingItem.id ? { ...item, id: i.id, step: i.step } : i
      );
      setChecklist((prev) =>
        prev
          ? {
              ...prev,
              items: updatedItems,
              totalEstimatedTime: updatedItems.reduce((sum, i) => sum + i.estimatedTime, 0),
              updatedAt: new Date(),
            }
          : null
      );
      toast.success('Ítem actualizado');
      setIsEditingItem(false);
      setEditingItem(null);
    } else {
      setChecklist((prev) =>
        prev
          ? {
              ...prev,
              items: [...prev.items, item],
              totalEstimatedTime: prev.totalEstimatedTime + item.estimatedTime,
              updatedAt: new Date(),
            }
          : null
      );
      toast.success('Ítem agregado al checklist');
    }

    setNewItem({
      title: '',
      description: '',
      estimatedTime: 30,
      priority: 'medium',
      toolsRequired: [],
    });
    setToolInput('');
  };

  const handleDeleteItem = (id: string) => {
    setChecklist((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items
              .filter((i) => i.id !== id)
              .map((i, idx) => ({ ...i, step: idx + 1 })),
            totalEstimatedTime: prev.items
              .filter((i) => i.id !== id)
              .reduce((sum, i) => sum + i.estimatedTime, 0),
            updatedAt: new Date(),
          }
        : null
    );
    toast.success('Ítem eliminado');
  };

  const handleEditItem = (item: ChecklistItem) => {
    setEditingItem(item);
    setNewItem({
      title: item.title,
      description: item.description,
      estimatedTime: item.estimatedTime,
      priority: item.priority,
      toolsRequired: item.toolsRequired,
    });
    setToolInput('');
    setIsEditingItem(true);
  };

  const handleAddTool = () => {
    if (toolInput.trim()) {
      setNewItem((prev) => ({
        ...prev,
        toolsRequired: [...(prev.toolsRequired || []), toolInput.trim()],
      }));
      setToolInput('');
    }
  };

  const handleRemoveTool = (tool: string) => {
    setNewItem((prev) => ({
      ...prev,
      toolsRequired: (prev.toolsRequired || []).filter((t) => t !== tool),
    }));
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!checklist || active.id === over.id) return;

    const oldIndex = checklist.items.findIndex((i) => i.id === active.id);
    const newIndex = checklist.items.findIndex((i) => i.id === over.id);

    const reorderedItems = arrayMove(checklist.items, oldIndex, newIndex).map(
      (i, idx) => ({ ...i, step: idx + 1 })
    );

    setChecklist({
      ...checklist,
      items: reorderedItems,
      updatedAt: new Date(),
    });
    toast.success('Ítems reordenados');
  };

  return (
    <Card className="border-2 border-primary">
      <CardHeader className="bg-primary/5">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{checklist.name}</CardTitle>
            {/* CardDescription renderiza un <p>; Badge renderiza un <div>, que no
                puede ser hijo de un <p> (HTML inválido, error de hidratación en
                React). El Badge pasa a ser hermano del texto, no hijo suyo. */}
            <div className="flex items-center mt-2">
              <CardDescription>Máquina: {checklist.machineType}</CardDescription>
              <Badge variant="secondary" className="ml-4">{maintenanceTypeLabel[checklist.maintenanceType] ?? checklist.maintenanceType}</Badge>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onPreview}
            >
              <Eye size={16} className="mr-2" />
              Vista previa
            </Button>
            <Button
              onClick={onBack}
              variant="outline"
            >
              Volver
            </Button>
            <Button onClick={onSave} className="bg-green-600 hover:bg-green-700">
              <Save size={16} className="mr-2" />
              Guardar checklist
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        {/* Add Item Form */}
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="text-base">
              {isEditingItem ? '✏️ Editar ítem' : '➕ Agregar ítem nuevo'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="title">Título del ítem *</Label>
                <Input
                  id="title"
                  placeholder="ej., Limpiar rodillos de tinta"
                  value={newItem.title || ''}
                  onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="time">Tiempo estimado (minutos) *</Label>
                <Input
                  id="time"
                  type="number"
                  min="1"
                  value={newItem.estimatedTime || 30}
                  onChange={(e) =>
                    setNewItem({ ...newItem, estimatedTime: parseInt(e.target.value) })
                  }
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                placeholder="Instrucciones detalladas para este paso..."
                value={newItem.description || ''}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="priority">Prioridad</Label>
                <Select
                  value={newItem.priority || 'medium'}
                  onValueChange={(val) =>
                    setNewItem({
                      ...newItem,
                      priority: val as any,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baja</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="critical">Crítica</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="tools-input">Herramientas requeridas</Label>
                <div className="flex gap-2">
                  <Input
                    id="tools-input"
                    placeholder="ej., Llave, destornillador"
                    value={toolInput}
                    onChange={(e) => setToolInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddTool()}
                  />
                  <Button variant="outline" onClick={handleAddTool}>
                    Agregar
                  </Button>
                </div>
              </div>
            </div>

            {(newItem.toolsRequired?.length || 0) > 0 && (
              <div className="flex flex-wrap gap-2">
                {newItem.toolsRequired?.map((tool) => (
                  <Badge
                    key={tool}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => handleRemoveTool(tool)}
                  >
                    {tool} ✕
                  </Badge>
                ))}
              </div>
            )}

            <Button
              onClick={handleAddItem}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {isEditingItem ? 'Actualizar ítem' : 'Agregar ítem'}
            </Button>
          </CardContent>
        </Card>

        {/* Items List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              Ítems del checklist ({checklist.items.length})
            </h3>
            <div className="text-sm text-muted-foreground">
              Tiempo total: <span className="font-semibold">{checklist.totalEstimatedTime} min</span>
            </div>
          </div>

          {checklist.items.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={checklist.items.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                {/* Encabezados de sección intercalados, no un SortableContext por
                    grupo -- reordenar sigue siendo un solo arrastre lineal (el
                    orden real de los pasos), la sección sólo se muestra como
                    referencia de dónde está parado cada uno. */}
                <div className="space-y-2">
                  {groupItemsBySection(checklist.items).map((group) => (
                    <div key={group.section} className="space-y-2">
                      {group.section !== SIN_SECCION && (
                        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:pt-0">
                          {group.section}
                        </p>
                      )}
                      {group.items.map((item) => (
                        <DraggableChecklistItem
                          key={item.id}
                          item={item}
                          onDelete={handleDeleteItem}
                          onEdit={handleEditItem}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-border rounded-lg">
              <AlertCircle size={32} className="text-muted-foreground opacity-30 mb-2" />
              <p className="text-muted-foreground">Sin ítems todavía. Agrega el primer paso de mantención arriba.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
