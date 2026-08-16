/**
 * Spanish display labels for enum values that are shown directly in the UI.
 * The underlying data values stay in English/snake_case — only the rendered
 * text is translated, so filtering/logic against the raw values is unaffected.
 */

export const OT_STATUS_LABELS: Record<string, string> = {
  pre_press: 'Pre-Prensa',
  visto_bueno: 'Visto Bueno',
  paper_purchase: 'Compras',
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

/**
 * Badge/dot background classes for each OT pipeline stage, grouped by phase so
 * the colour communicates *where in the flow* an order is:
 *   pre-producción → ámbar · impresión → azul · acabado → violeta ·
 *   tercerizado → pizarra · despacho → cian · completado → verde.
 * Use otStatusColor() rather than hand-rolling per-screen maps (those drifted to
 * a stale pending/in_progress vocabulary that doesn't exist in the ot_status enum).
 */
export const OT_STATUS_COLORS: Record<string, string> = {
  pre_press: 'bg-amber-500',
  visto_bueno: 'bg-amber-500',
  paper_purchase: 'bg-amber-500',
  in_storage: 'bg-amber-500',
  guillotine_first_cut: 'bg-blue-500',
  offset_printing: 'bg-blue-500',
  digital_printing: 'bg-blue-500',
  die_cutting: 'bg-violet-500',
  guillotine_final_cut: 'bg-violet-500',
  workshop: 'bg-violet-500',
  workshop_revision: 'bg-violet-500',
  outsourced: 'bg-slate-400',
  ready_for_delivery: 'bg-cyan-500',
  in_delivery: 'bg-cyan-500',
  completed: 'bg-green-500',
};

/**
 * Same phase palette as OT_STATUS_COLORS, as hex — for consumers that style
 * with inline `background`/`color` instead of Tailwind classes (e.g. the
 * kanban hover card). Keep the two maps in phase-lockstep.
 */
export const OT_STATUS_HEX: Record<string, string> = {
  pre_press: '#f59e0b',
  visto_bueno: '#f59e0b',
  paper_purchase: '#f59e0b',
  in_storage: '#f59e0b',
  guillotine_first_cut: '#3b82f6',
  offset_printing: '#3b82f6',
  digital_printing: '#3b82f6',
  die_cutting: '#8b5cf6',
  guillotine_final_cut: '#8b5cf6',
  workshop: '#8b5cf6',
  workshop_revision: '#8b5cf6',
  outsourced: '#94a3b8',
  ready_for_delivery: '#06b6d4',
  in_delivery: '#06b6d4',
  completed: '#22c55e',
};

export function otStatusHex(status: string | null | undefined): string {
  if (!status) return '#6b7280';
  return OT_STATUS_HEX[status] ?? '#6b7280';
}

/** Phase → translucent badge trio (bg + text + border), light/dark aware. */
const PHASE_BADGE: Record<string, string> = {
  amber:   'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30',
  blue:    'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30',
  violet:  'bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/30',
  slate:   'bg-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-500/30',
  cyan:    'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
  green:   'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30',
  gray:    'bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30',
};
const STATUS_PHASE: Record<string, keyof typeof PHASE_BADGE> = {
  pre_press: 'amber', visto_bueno: 'amber', paper_purchase: 'amber', in_storage: 'amber',
  guillotine_first_cut: 'blue', offset_printing: 'blue', digital_printing: 'blue',
  die_cutting: 'violet', guillotine_final_cut: 'violet', workshop: 'violet', workshop_revision: 'violet',
  outsourced: 'slate', ready_for_delivery: 'cyan', in_delivery: 'cyan', completed: 'green',
};

/** Full translucent badge classes for an OT status chip. Single source — use
 * instead of hand-rolled per-screen maps (which drifted colors and labels). */
export function otStatusBadgeClass(status: string | null | undefined): string {
  const phase = status ? STATUS_PHASE[status] : undefined;
  return PHASE_BADGE[phase ?? 'gray'];
}

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

export function otStatusColor(status: string | null | undefined): string {
  if (!status) return 'bg-gray-400';
  return OT_STATUS_COLORS[status] ?? 'bg-gray-400';
}

export function machineStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return MACHINE_STATUS_LABELS[status] ?? status;
}

export function ratingLabel(rating: string | null | undefined): string {
  if (!rating) return '';
  return RATING_LABELS[rating] ?? rating;
}

/* ─── Los otros estados del recorrido ────────────────────────── */

/**
 * Una OT no es lo único que tiene estado. Un presupuesto se firma, una orden de
 * compra se factura, una guía se entrega y una factura se paga — y hasta acá
 * esas cuatro salían crudas en pantalla: el cliente leía `signed`, `invoiced`,
 * `dispatched`, `issued`.
 *
 * Cada enum tiene su función. No es ceremonia: un `Record` suelto obliga a cada
 * pantalla a decidir qué hacer con el valor desconocido, y ahí es donde se
 * escapan los `undefined` y los `snake_case`. La función decide una vez.
 */

/** `vb_status` — el presupuesto, desde que se escribe hasta que se convierte. */
export const VB_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviado al cliente',
  signed: 'Firmado',
  converted: 'Convertido en OT',
  rejected: 'Rechazado',
  expired: 'Vencido',
};

/** `oc_status` — la orden de compra al proveedor. */
export const OC_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviada al proveedor',
  received: 'Recibida en bodega',
  invoiced: 'Facturada',
  closed: 'Cerrada',
  cancelled: 'Anulada',
};

/** `sales_invoice_status` — la factura de venta. */
export const SALES_INVOICE_STATUS_LABELS: Record<string, string> = {
  issued: 'Emitida',
  sent: 'Enviada',
  paid: 'Pagada',
  cancelled: 'Anulada',
};

/** `factura_compra_status` — la factura del proveedor. */
export const PURCHASE_INVOICE_STATUS_LABELS: Record<string, string> = {
  received: 'Recibida',
  matched: 'Cuadrada con la OC',
  disputed: 'En disputa',
  paid: 'Pagada',
};

/** `dispatch_status` — la guía de despacho. */
export const DISPATCH_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  dispatched: 'Despachada',
  delivered: 'Entregada',
  cancelled: 'Anulada',
};

/** `capture_status` — el parte que manda el taller. */
export const CAPTURE_STATUS_LABELS: Record<string, string> = {
  pending: 'Por revisar',
  approved: 'Aprobado',
  auto_approved: 'Aprobado automáticamente',
  rejected: 'Rechazado',
  needs_revision: 'Necesita corrección',
};

/** `employee_status` — la situación de una persona. */
export const EMPLOYEE_STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  on_leave: 'Con permiso',
  terminated: 'Desvinculado',
};

/** `maintenance_status` — el trabajo de mantención. */
export const MAINTENANCE_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Programada',
  in_progress: 'En curso',
  completed: 'Completada',
  cancelled: 'Anulada',
  overdue: 'Atrasada',
};

/**
 * El respaldo cuando el valor no está en el mapa.
 *
 * Devolver el crudo tal cual —`needs_revision`— es peor que no traducir: parece
 * un error de la app. Se le saca el guión bajo y se le pone mayúscula, que al
 * menos se lee como texto. Y nunca devuelve vacío: una celda en blanco no
 * distingue «sin estado» de «se rompió algo».
 */
function traducir(mapa: Record<string, string>, valor: string | null | undefined): string {
  if (!valor) return '—';
  const conocido = mapa[valor];
  if (conocido) return conocido;
  const suelto = valor.replace(/_/g, ' ');
  return suelto.charAt(0).toUpperCase() + suelto.slice(1);
}

export const vbStatusLabel = (s: string | null | undefined) => traducir(VB_STATUS_LABELS, s);
export const ocStatusLabel = (s: string | null | undefined) => traducir(OC_STATUS_LABELS, s);
export const salesInvoiceStatusLabel = (s: string | null | undefined) => traducir(SALES_INVOICE_STATUS_LABELS, s);
export const purchaseInvoiceStatusLabel = (s: string | null | undefined) => traducir(PURCHASE_INVOICE_STATUS_LABELS, s);
export const dispatchStatusLabel = (s: string | null | undefined) => traducir(DISPATCH_STATUS_LABELS, s);
export const captureStatusLabel = (s: string | null | undefined) => traducir(CAPTURE_STATUS_LABELS, s);
export const employeeStatusLabel = (s: string | null | undefined) => traducir(EMPLOYEE_STATUS_LABELS, s);
export const maintenanceStatusLabel = (s: string | null | undefined) => traducir(MAINTENANCE_STATUS_LABELS, s);

/**
 * Semáforo para los estados que importan comercialmente: pagado y entregado en
 * verde, anulado y rechazado en rojo, lo que espera algo en ámbar.
 */
const TONO: Record<string, keyof typeof PHASE_BADGE> = {
  paid: 'green', delivered: 'green', converted: 'green', completed: 'green',
  approved: 'green', auto_approved: 'green', closed: 'green', matched: 'green', active: 'green',
  signed: 'cyan', sent: 'cyan', issued: 'cyan', dispatched: 'cyan', received: 'cyan', in_progress: 'cyan',
  draft: 'gray', inactive: 'gray', scheduled: 'gray',
  pending: 'amber', needs_revision: 'amber', on_leave: 'amber', expired: 'amber',
  cancelled: 'slate', terminated: 'slate',
  rejected: 'violet', disputed: 'violet', overdue: 'violet',
};

/** Chip translúcido para cualquiera de los estados de arriba. */
export function statusBadgeClass(status: string | null | undefined): string {
  return PHASE_BADGE[(status && TONO[status]) || 'gray'];
}
