'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, Copy, Trash2 } from 'lucide-react';
import { actionTypeMeta, frequencyLabel } from '@/lib/maintenance-checklist-meta';
import { maintenanceTypeLabel, type MaintenanceChecklist } from './types';

export function ChecklistsList({
  checklists,
  onSelect,
  onDuplicate,
  onDelete,
  onCreateNew,
}: {
  checklists: MaintenanceChecklist[];
  onSelect: (checklist: MaintenanceChecklist) => void;
  onDuplicate: (checklist: MaintenanceChecklist) => void;
  onDelete: (checklistId: string) => void;
  onCreateNew: () => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {checklists.map((checklist) => (
        <Card
          key={checklist.id}
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => onSelect(checklist)}
        >
          <CardHeader>
            <CardTitle className="text-lg">{checklist.name}</CardTitle>
            <div className="flex items-center gap-2">
              <CardDescription>{checklist.machineType}</CardDescription>
              <Badge variant="outline" className="text-[10px]">{frequencyLabel(checklist.frequency)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{checklist.items.length} ítems</span>
              <Badge variant="secondary">{maintenanceTypeLabel[checklist.maintenanceType] ?? checklist.maintenanceType}</Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock size={16} />
              <span>{checklist.totalEstimatedTime} min total</span>
            </div>
            {/* Huella de tipos de acción -- un vistazo a de qué está hecho el
                checklist sin abrirlo (¿es sobre todo limpieza? ¿lubricación?). */}
            {(() => {
              const present = [...new Set(checklist.items.map((i) => i.actionType).filter(Boolean))] as string[];
              if (present.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-1">
                  {present.map((at) => {
                    const meta = actionTypeMeta(at);
                    const Icon = meta.icon;
                    return (
                      <span key={at} title={meta.label} className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${meta.className}`}>
                        <Icon className="h-3 w-3" />
                      </span>
                    );
                  })}
                </div>
              );
            })()}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate(checklist);
                }}
              >
                <Copy size={14} className="mr-1" />
                Duplicar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(checklist.id);
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
          <CheckCircle2 size={48} className="text-muted-foreground opacity-30 mb-4" />
          <p className="text-muted-foreground text-lg mb-4">Aún no hay listas de verificación</p>
          <Button onClick={onCreateNew}>Cree su primera lista de verificación</Button>
        </div>
      )}
    </div>
  );
}
