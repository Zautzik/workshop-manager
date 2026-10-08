export interface ChecklistItem {
  id: string;
  step: number;
  title: string;
  description: string;
  estimatedTime: number; // en minutos
  priority: 'low' | 'medium' | 'high' | 'critical';
  toolsRequired: string[];
  completed?: boolean;
  /** Migrado de manuales técnicos -- "Alimentador — Cabezal aspirador". Ausente en checklists sembrados originalmente. */
  section?: string;
  /** Migrado de manuales técnicos -- inspect/clean/lubricate/replace/check/adjust/service/fill. Ver maintenance-checklist-meta.ts. */
  actionType?: string;
}

export interface MaintenanceChecklist {
  id: string;
  name: string;
  machineType: string;
  maintenanceType: 'preventive' | 'corrective' | 'emergency' | 'inspection' | 'cleaning';
  /** daily/weekly/monthly/... -- ver frequencyLabel en maintenance-checklist-meta.ts. Sólo lectura acá: el editor no la cambia, sólo la muestra. */
  frequency: string;
  items: ChecklistItem[];
  totalEstimatedTime: number;
  createdAt: Date;
  updatedAt: Date;
}

export const priorityColors: Record<ChecklistItem['priority'], string> = {
  low: 'border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300',
  medium: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  high: 'border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-300',
  critical: 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300',
};

export const priorityLabel: Record<ChecklistItem['priority'], string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
};

export const maintenanceTypeLabel: Record<MaintenanceChecklist['maintenanceType'], string> = {
  preventive: 'Preventivo',
  corrective: 'Correctivo',
  emergency: 'Emergencia',
  inspection: 'Inspección',
  cleaning: 'Limpieza',
};

/**
 * Los ítems reales conviven en al menos tres formas -- creados en este
 * editor (`{id, step, title, description, estimatedTime, priority,
 * toolsRequired}`), migrados desde manuales técnicos (`{id, title, section,
 * actionType, estimatedTime}`, sin priority ni toolsRequired) y sembrados
 * originalmente (`{order, description, estimated_minutes}`, sin id ni
 * title siquiera). Sin normalizar acá, DraggableChecklistItem revienta
 * leyendo `.toolsRequired.length` de un ítem migrado.
 */
export function normalizeItem(raw: any, index: number): ChecklistItem {
  // `...raw` primero: `section`/`actionType` (y cualquier otro campo de un
  // ítem migrado) viajan aunque ChecklistItem no los tipe, así que abrir y
  // guardar sin tocar nada no los borra.
  return {
    ...raw,
    id: raw.id ?? `seed-${index}`,
    step: raw.step ?? raw.order ?? index + 1,
    title: raw.title ?? raw.description ?? `Paso ${index + 1}`,
    description: raw.title ? (raw.description ?? '') : '',
    estimatedTime: raw.estimatedTime ?? raw.estimated_minutes ?? 0,
    priority: raw.priority ?? 'medium',
    toolsRequired: Array.isArray(raw.toolsRequired) ? raw.toolsRequired : [],
  };
}

export const SIN_SECCION = 'Sin sección';

/** Agrupa preservando el primer orden de aparición -- no reordena a algo distinto de cómo el manual original presentaba sus pasos. */
export function groupItemsBySection(items: ChecklistItem[]): { section: string; items: ChecklistItem[] }[] {
  const order: string[] = [];
  const map = new Map<string, ChecklistItem[]>();
  for (const item of items) {
    const key = item.section || SIN_SECCION;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(item);
  }
  return order.map((section) => ({ section, items: map.get(section)! }));
}
