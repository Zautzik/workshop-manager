/**
 * @fileoverview Derivar la lista de ítems tildables de una orden de
 * mantención -- extraído de OrdenesPanel.tsx para que la nueva pantalla
 * móvil (escaneada por QR, MachinePendingMaintenance.tsx) ejecute una orden
 * por el mismo camino exacto que el escritorio, no una reimplementación
 * aparte que pueda desalinearse.
 */

export interface CompletedChecklistItem {
  item_id: string;
  title?: string;
  description?: string;
  estimated_minutes?: number | null;
  completed: boolean;
  completed_at?: string | null;
  completed_by?: string | null;
  notes?: string | null;
}

/**
 * De la checklist (JSONB, dos formas conviven en datos reales -- la del
 * editor `{id, title, estimatedTime}` y la de datos sembrados `{order,
 * description, estimated_minutes}`) o del snapshot ya guardado. Nunca
 * inventa `completed`: si la orden no tiene completed_items, arranca todo en
 * false para una orden nueva, o se marca `untracked` para una ya completada
 * de antes de que este snapshot existiera -- no se puede decir qué se hizo
 * de verdad, así que no se finge saberlo.
 */
export function deriveChecklistItems(order: any): { items: CompletedChecklistItem[]; tracked: boolean } {
  if (Array.isArray(order.completed_items)) {
    return { items: order.completed_items, tracked: true };
  }
  const checklistItems = order.maintenance_checklists?.items;
  if (!Array.isArray(checklistItems) || checklistItems.length === 0) {
    return { items: [], tracked: true };
  }
  const isHistorical = order.status === 'completed' || order.status === 'cancelled';
  const items = checklistItems.map((raw: any, i: number) => ({
    item_id: raw.id ?? `item-${raw.order ?? i}`,
    title: raw.title ?? raw.description ?? `Paso ${i + 1}`,
    description: raw.title ? raw.description : undefined,
    estimated_minutes: raw.estimatedTime ?? raw.estimated_minutes ?? null,
    completed: false,
    notes: null,
  }));
  return { items, tracked: !isHistorical };
}
