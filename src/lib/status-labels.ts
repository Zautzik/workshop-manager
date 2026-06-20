/**
 * Spanish display labels for enum values that are shown directly in the UI.
 * The underlying data values stay in English/snake_case — only the rendered
 * text is translated, so filtering/logic against the raw values is unaffected.
 */

export const OT_STATUS_LABELS: Record<string, string> = {
  pre_press: 'Pre-Prensa',
  visto_bueno: 'Visto Bueno',
  paper_purchase: 'Compra de Papel',
  in_storage: 'En Bodega',
  guillotine_first_cut: 'Primer Corte',
  offset_printing: 'Impresión Offset',
  digital_printing: 'Impresión Digital',
  die_cutting: 'Troquelado',
  guillotine_final_cut: 'Corte Final',
  workshop: 'Taller',
  outsourced: 'Tercerizado',
  workshop_revision: 'Revisión Taller',
  ready_for_delivery: 'Listo para Despacho',
  in_delivery: 'En Despacho',
  completed: 'Completado',
};

export const MACHINE_STATUS_LABELS: Record<string, string> = {
  idle: 'Inactiva',
  running: 'En marcha',
  maintenance: 'Mantenimiento',
  offline: 'Fuera de línea',
};

/** Worker consistency / rating labels (shown on Planta worker roster). */
export const RATING_LABELS: Record<string, string> = {
  'High consistency': 'Alta consistencia',
  'Medium consistency': 'Consistencia media',
  'Low consistency': 'Baja consistencia',
  High: 'Alta',
  Medium: 'Media',
  Low: 'Baja',
};

export function otStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return OT_STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

export function machineStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return MACHINE_STATUS_LABELS[status] ?? status;
}

export function ratingLabel(rating: string | null | undefined): string {
  if (!rating) return '';
  return RATING_LABELS[rating] ?? rating;
}
