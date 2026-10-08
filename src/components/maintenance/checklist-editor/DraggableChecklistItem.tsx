'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Clock, Trash2 } from 'lucide-react';
import { actionTypeMeta } from '@/lib/maintenance-checklist-meta';
import { priorityColors, priorityLabel, type ChecklistItem } from './types';

export const DraggableChecklistItem = ({
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
      className="flex items-start gap-3 p-4 bg-card border border-border rounded-lg hover:shadow-md transition-shadow"
    >
      <div
        {...attributes}
        {...listeners}
        className="flex-shrink-0 mt-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
      >
        <GripVertical size={20} />
      </div>

      <div className="flex-grow min-w-0">
        {/* No repite item.section acá -- el grupo que lo contiene (ver
            groupItemsBySection en el listado y en Vista previa) ya lo muestra
            una vez como encabezado; casi todas las secciones migradas traen
            un solo ítem, así que repetirlo por ítem sólo duplicaba el texto. */}
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="inline-flex items-center justify-center w-6 h-6 bg-primary text-primary-foreground rounded-full text-xs font-bold">
            {item.step}
          </span>
          <h4 className="font-semibold text-foreground break-words">{item.title}</h4>
          {item.actionType && (() => {
            const meta = actionTypeMeta(item.actionType);
            const Icon = meta.icon;
            return (
              <Badge className={meta.className} variant="outline">
                <Icon className="mr-1 h-3 w-3" />
                {meta.label}
              </Badge>
            );
          })()}
          <Badge className={priorityColors[item.priority]} variant="outline">
            {priorityLabel[item.priority]}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground mb-2 break-words">{item.description}</p>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock size={16} />
            <span>{item.estimatedTime} min</span>
          </div>

          {item.toolsRequired.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Herramientas:</span>
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
          className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Editar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDelete(item.id)}
          className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
        >
          <Trash2 size={16} />
        </Button>
      </div>
    </div>
  );
};
