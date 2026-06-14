/**
 * @fileoverview Maintenance Checklist Editor Component
 * 
 * SYSTEM ROLE: Interactive Maintenance Task Creator & Manager
 * 
 * Features:
 * - âœ… Drag-and-drop reordering of checklist items
 * - ðŸ“ Rich text input for detailed instructions
 * - â±ï¸ Time estimates for each task
 * - ðŸŽ¯ Priority levels and tool requirements
 * - ðŸ”„ Duplicate checklist templates
 * - ðŸ’¾ Save/preview functionality
 * - ðŸ“± Fully responsive and mobile-friendly
 * 
 * Used by maintenance technicians and managers to plan equipment maintenance work.
 * 
 * Build: v1.0.1 - Fixed PointerSensor configuration
 */
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  Trash2,
  GripVertical,
  Clock,
  AlertCircle,
  CheckCircle2,
  Copy,
  Save,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { useMaintenanceChecklists } from '@/hooks/use-maintenance-queries';

interface ChecklistItem {
  id: string;
  step: number;
  title: string;
  description: string;
  estimatedTime: number; // in minutes
  priority: 'low' | 'medium' | 'high' | 'critical';
  toolsRequired: string[];
  completed?: boolean;
}

interface MaintenanceChecklist {
  id: string;
  name: string;
  machineType: string;
  maintenanceType: 'preventive' | 'corrective' | 'emergency' | 'inspection' | 'cleaning';
  items: ChecklistItem[];
  totalEstimatedTime: number;
  createdAt: Date;
  updatedAt: Date;
}

const priorityColors = {
  low: 'bg-blue-100 text-blue-800 border-blue-300',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  high: 'bg-orange-100 text-orange-800 border-orange-300',
  critical: 'bg-red-100 text-red-800 border-red-300',
};

const DraggableChecklistItem = ({
  item,
  onDelete,
  onEdit,
}: {
  item: ChecklistItem;
  onDelete: (id: string) => void;
  onEdit: (item: ChecklistItem) => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-3 p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
    >
      <div
        {...attributes}
        {...listeners}
        className="flex-shrink-0 mt-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
      >
        <GripVertical size={20} />
      </div>

      <div className="flex-grow min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center justify-center w-6 h-6 bg-primary text-primary-foreground rounded-full text-xs font-bold">
            {item.step}
          </span>
          <h4 className="font-semibold text-gray-900 break-words">{item.title}</h4>
          <Badge className={priorityColors[item.priority]} variant="outline">
            {item.priority}
          </Badge>
        </div>

        <p className="text-sm text-gray-600 mb-2 break-words">{item.description}</p>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-1 text-gray-500">
            <Clock size={16} />
            <span>{item.estimatedTime} min</span>
          </div>

          {item.toolsRequired.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Tools:</span>
              <div className="flex flex-wrap gap-1">
                {item.toolsRequired.map((tool, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {tool}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEdit(item)}
          className="text-blue-600 hover:text-blue-700"
        >
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDelete(item.id)}
          className="text-red-600 hover:text-red-700"
        >
          <Trash2 size={16} />
        </Button>
      </div>
    </div>
  );
};

export default function MaintenanceChecklistEditor() {
  const { t } = useLanguage();
  
  const [checklists, setChecklists] = useState<MaintenanceChecklist[]>([]);
  const [selectedChecklist, setSelectedChecklist] = useState<MaintenanceChecklist | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditingItem, setIsEditingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  const { data: rawChecklists = [], isError } = useMaintenanceChecklists();

  useEffect(() => {
    if (isError) {
      toast.error('Failed to load checklists');
    }
  }, [isError]);

  useEffect(() => {
    const mapped: MaintenanceChecklist[] = rawChecklists.map((row: any) => ({
      id: row.id,
      name: row.name,
      machineType: row.machine_type || row.machineType || '',
      maintenanceType: row.maintenance_type || row.maintenanceType || 'preventive',
      items: Array.isArray(row.items) ? row.items : [],
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
      toast.error('Please enter a title for the checklist item');
      return;
    }

    const item: ChecklistItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      step: (selectedChecklist?.items.length || 0) + 1,
      title: newItem.title,
      description: newItem.description || '',
      estimatedTime: newItem.estimatedTime || 30,
      priority: newItem.priority as any,
      toolsRequired: newItem.toolsRequired || [],
    };

    if (isEditingItem && editingItem) {
      const updatedItems = (selectedChecklist?.items || []).map((i) =>
        i.id === editingItem.id ? { ...item, id: i.id, step: i.step } : i
      );
      setSelectedChecklist((prev) =>
        prev
          ? {
              ...prev,
              items: updatedItems,
              totalEstimatedTime: updatedItems.reduce((sum, i) => sum + i.estimatedTime, 0),
              updatedAt: new Date(),
            }
          : null
      );
      toast.success('Item updated successfully!');
      setIsEditingItem(false);
      setEditingItem(null);
    } else {
      setSelectedChecklist((prev) =>
        prev
          ? {
              ...prev,
              items: [...prev.items, item],
              totalEstimatedTime: prev.totalEstimatedTime + item.estimatedTime,
              updatedAt: new Date(),
            }
          : null
      );
      toast.success('Item added to checklist!');
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
    setSelectedChecklist((prev) =>
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
    toast.success('Item removed');
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
    if (!selectedChecklist || active.id === over.id) return;

    const oldIndex = selectedChecklist.items.findIndex((i) => i.id === active.id);
    const newIndex = selectedChecklist.items.findIndex((i) => i.id === over.id);

    const reorderedItems = arrayMove(selectedChecklist.items, oldIndex, newIndex).map(
      (i, idx) => ({ ...i, step: idx + 1 })
    );

    setSelectedChecklist({
      ...selectedChecklist,
      items: reorderedItems,
      updatedAt: new Date(),
    });
    toast.success('Items reordered!');
  };

  const handleCreateChecklist = () => {
    if (!newChecklist.name?.trim() || !newChecklist.machineType?.trim()) {
      toast.error('Please fill in name and machine type');
      return;
    }

    const checklist: MaintenanceChecklist = {
      id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: newChecklist.name,
      machineType: newChecklist.machineType,
      maintenanceType: newChecklist.maintenanceType as any,
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
    toast.success('Checklist created!');
  };

  const handleSaveChecklist = async () => {
    if (!selectedChecklist?.items.length) {
      toast.error('Add at least one item before saving');
      return;
    }

    try {
      const isNew = !selectedChecklist.id || selectedChecklist.id.startsWith('temp-');

      if (isNew) {
        const { data, error } = await supabase
          .from('maintenance_checklists')
          .insert([
            {
              name: selectedChecklist.name,
              machine_type: selectedChecklist.machineType,
              maintenance_type: selectedChecklist.maintenanceType,
              items: JSON.parse(JSON.stringify(selectedChecklist.items)),
              total_estimated_time: selectedChecklist.totalEstimatedTime,
              frequency: 'as_needed',
            },
          ])
          .select();

        if (error) {
          console.error('Supabase insert error:', JSON.stringify(error));
          throw error;
        }
        
        if (!data || data.length === 0) {
          throw new Error('No data returned from insert');
        }

        const savedChecklist = { ...selectedChecklist, id: data[0].id };
        // Replace the temp checklist with the saved one
        setChecklists((prev) =>
          prev.map((c) => (c.id === selectedChecklist.id ? savedChecklist : c))
        );
        setSelectedChecklist(savedChecklist);
      } else {
        // Update existing checklist
        const { error } = await supabase
          .from('maintenance_checklists')
          .update({
            name: selectedChecklist.name,
            machine_type: selectedChecklist.machineType,
            maintenance_type: selectedChecklist.maintenanceType,
            items: JSON.parse(JSON.stringify(selectedChecklist.items)),
            total_estimated_time: selectedChecklist.totalEstimatedTime,
            updated_at: new Date().toISOString(),
          })
          .eq('id', selectedChecklist.id);

        if (error) {
          console.error('Supabase update error:', JSON.stringify(error));
          throw error;
        }
        
        setChecklists((prev) =>
          prev.map((c) => (c.id === selectedChecklist.id ? selectedChecklist : c))
        );
      }

      toast.success('Checklist saved successfully! ðŸŽ‰');
    } catch (error) {
      console.error('Error saving checklist:', error);
      toast.error('Failed to save checklist');
    }
  };

  const handleDuplicateChecklist = (checklist: MaintenanceChecklist) => {
    const newChecklist = {
      ...checklist,
      id: `temp-${Date.now()}`,
      name: `${checklist.name} (Copy)`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setChecklists([...checklists, newChecklist]);
    setSelectedChecklist(newChecklist);
    toast.success('Checklist duplicated! Click Save to persist it.');
  };

  const handleDeleteChecklist = async (checklistId: string) => {
    try {
      // Remove from local state immediately for UX
      setChecklists((prev) => prev.filter((c) => c.id !== checklistId));
      
      // If it's a temp checklist, no need to delete from DB
      if (checklistId.startsWith('temp-')) {
        toast.success('Checklist deleted');
        return;
      }
      
      // Delete from Supabase
      const { error } = await supabase
        .from('maintenance_checklists')
        .delete()
        .eq('id', checklistId);
      
      if (error) {
        throw error;
      }
      
      toast.success('Checklist deleted');
    } catch (error) {
      // Restore the checklist if deletion fails
      const restoredChecklist = [...checklists].find(c => c.id === checklistId);
      if (restoredChecklist) {
        setChecklists((prev) => [...prev, restoredChecklist]);
      }
      toast.error('Failed to delete checklist: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Listas de verificación de mantenimiento</h1>
          <p className="text-gray-600 mt-1">Cree y administre procedimientos de mantenimiento detallados</p>
        </div>
        <Button
          onClick={() => setIsDialogOpen(true)}
          className="bg-primary hover:bg-primary/90"
        >
          <Plus size={20} className="mr-2" />
          New Checklist
        </Button>
      </div>

      {/* Checklists List */}
      {!selectedChecklist && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {checklists.map((checklist) => (
            <Card
              key={checklist.id}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setSelectedChecklist(checklist)}
            >
              <CardHeader>
                <CardTitle className="text-lg">{checklist.name}</CardTitle>
                <CardDescription>{checklist.machineType}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{checklist.items.length} items</span>
                  <Badge variant="secondary">{checklist.maintenanceType}</Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock size={16} />
                  <span>{checklist.totalEstimatedTime} min total</span>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDuplicateChecklist(checklist);
                    }}
                  >
                    <Copy size={14} className="mr-1" />
                    Duplicate
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-red-600 hover:text-red-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteChecklist(checklist.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {checklists.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center p-12 text-center">
              <CheckCircle2 size={48} className="text-gray-300 mb-4" />
              <p className="text-gray-500 text-lg mb-4">Aún no hay listas de verificación</p>
              <Button onClick={() => setIsDialogOpen(true)}>Cree su primera lista de verificación</Button>
            </div>
          )}
        </div>
      )}

      {/* Checklist Editor */}
      {selectedChecklist && !isPreviewMode && (
        <Card className="border-2 border-primary">
          <CardHeader className="bg-primary/5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{selectedChecklist.name}</CardTitle>
                <CardDescription className="mt-2">
                  <span className="inline-block mr-4">Machine: {selectedChecklist.machineType}</span>
                  <Badge variant="secondary">{selectedChecklist.maintenanceType}</Badge>
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsPreviewMode(true)}
                >
                  <Eye size={16} className="mr-2" />
                  Preview
                </Button>
                <Button
                  onClick={() => setSelectedChecklist(null)}
                  variant="outline"
                >
                  Back
                </Button>
                <Button onClick={handleSaveChecklist} className="bg-green-600 hover:bg-green-700">
                  <Save size={16} className="mr-2" />
                  Save Checklist
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-6 space-y-6">
            {/* Add Item Form */}
            <Card className="bg-blue-50 border-blue-200">
              <CardHeader>
                <CardTitle className="text-base">
                  {isEditingItem ? 'âœï¸ Edit Checklist Item' : 'âž• Add New Item'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="title">Item Title *</Label>
                    <Input
                      id="title"
                      placeholder="ej., Limpiar rodillos de tinta"
                      value={newItem.title || ''}
                      onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="time">Estimated Time (minutes) *</Label>
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
                    <Label htmlFor="priority">Priority</Label>
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
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
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
                        Add
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
                        {tool} âœ•
                      </Badge>
                    ))}
                  </div>
                )}

                <Button
                  onClick={handleAddItem}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {isEditingItem ? 'Update Item' : 'Add Item'}
                </Button>
              </CardContent>
            </Card>

            {/* Items List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  Checklist Items ({selectedChecklist.items.length})
                </h3>
                <div className="text-sm text-gray-600">
                  Total Time: <span className="font-semibold">{selectedChecklist.totalEstimatedTime} min</span>
                </div>
              </div>

              {selectedChecklist.items.length > 0 ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={selectedChecklist.items.map((i) => i.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {selectedChecklist.items.map((item) => (
                        <DraggableChecklistItem
                          key={item.id}
                          item={item}
                          onDelete={handleDeleteItem}
                          onEdit={handleEditItem}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-gray-300 rounded-lg">
                  <AlertCircle size={32} className="text-gray-300 mb-2" />
                  <p className="text-gray-500">No items yet. Add your first maintenance step above.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview Mode */}
      {selectedChecklist && isPreviewMode && (
        <Card className="border-2 border-green-500">
          <CardHeader className="bg-green-50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{selectedChecklist.name} - Preview</CardTitle>
                <CardDescription className="mt-2">
                  Machine: {selectedChecklist.machineType} | Type: {selectedChecklist.maintenanceType}
                </CardDescription>
              </div>
              <Button onClick={() => setIsPreviewMode(false)} variant="outline">
                Back to Edit
              </Button>
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            <div className="bg-green-50 p-6 rounded-lg space-y-4 print:bg-white">
              <div className="text-center mb-6 pb-6 border-b-2 border-green-200">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">{selectedChecklist.name}</h1>
                <p className="text-gray-600 mb-4">
                  Machine: {selectedChecklist.machineType} | Maintenance: {selectedChecklist.maintenanceType}
                </p>
                <div className="flex justify-center gap-6 text-sm">
                  <div>
                    <span className="font-semibold text-gray-900">{selectedChecklist.items.length}</span>
                    <p className="text-gray-600">Steps</p>
                  </div>
                  <div>
                    <span className="font-semibold text-gray-900">{selectedChecklist.totalEstimatedTime}</span>
                    <p className="text-gray-600">Minutes</p>
                  </div>
                  <div>
                    <span className="font-semibold text-gray-900">
                      {new Date(selectedChecklist.updatedAt).toLocaleDateString()}
                    </span>
                    <p className="text-gray-600">Last Updated</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {selectedChecklist.items.map((item) => (
                  <div key={item.id} className="border-l-4 border-primary pl-4 py-3 page-break-inside-avoid">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 bg-primary text-primary-foreground rounded-full font-bold text-sm">
                          {item.step}
                        </div>
                        <h3 className="font-bold text-gray-900">{item.title}</h3>
                      </div>
                      <Badge className={priorityColors[item.priority]} variant="outline">
                        {item.priority.toUpperCase()}
                      </Badge>
                    </div>

                    {item.description && (
                      <p className="text-gray-700 mb-2 ml-11 whitespace-pre-wrap">{item.description}</p>
                    )}

                    <div className="flex flex-wrap gap-4 ml-11 text-sm">
                      <div className="flex items-center gap-1 text-gray-600">
                        <Clock size={14} />
                        {item.estimatedTime} min
                      </div>

                      {item.toolsRequired.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600">Tools:</span>
                          <span className="text-gray-900 font-medium">
                            {item.toolsRequired.join(', ')}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 ml-11 flex items-center gap-2 p-2 bg-gray-100 rounded">
                      <input type="checkbox" className="w-4 h-4 cursor-pointer" />
                      <span className="text-sm text-gray-600">Completado</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t-2 border-gray-300 text-sm text-gray-600">
                <p>Technician: _________________________</p>
                <p>Date: _________________________</p>
                <p>Notes: ___________________________________</p>
              </div>
            </div>

            <div className="mt-6 flex gap-2 justify-center">
              <Button
                onClick={() => window.print()}
                className="bg-blue-600 hover:bg-blue-700"
              >
                ðŸ–¨ï¸ Print Checklist
              </Button>
              <Button
                onClick={() => handleSaveChecklist()}
                className="bg-green-600 hover:bg-green-700"
              >
                <Save size={16} className="mr-2" />
                Save & Close
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Checklist Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear nueva lista de verificación de mantenimiento</DialogTitle>
            <DialogDescription>
              Set up a new maintenance checklist for equipment or machines
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="checklist-name">Checklist Name *</Label>
              <Input
                id="checklist-name"
                placeholder="ej., Mantenimiento mensual de impresora offset"
                value={newChecklist.name || ''}
                onChange={(e) => setNewChecklist({ ...newChecklist, name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="machine-type">Machine/Equipment Type *</Label>
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
                  <SelectItem value="preventive">Preventive</SelectItem>
                  <SelectItem value="corrective">Corrective</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                  <SelectItem value="inspection">Inspection</SelectItem>
                  <SelectItem value="cleaning">Cleaning</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateChecklist} className="bg-primary hover:bg-primary/90">
              Create Checklist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
