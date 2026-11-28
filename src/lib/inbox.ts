import type { AppRole } from '@/types/app-role';

/**
 * Inicio's inbox: what needs this person today (audit M1).
 *
 * Inicio was a launcher with no information. Each item here is one count from
 * the place that owns the fact, and links to the screen where it gets done —
 * the inbox never re-implements a screen, it only says "there are N, go here".
 *
 * Which items a role sees is decided here and nowhere else.
 */
export type InboxKey = 'late' | 'signoff' | 'captures' | 'maintenance' | 'invoice_disputes' | 'leave';

export interface InboxItemDef {
  /** Sentence fragment after the count: «3 OT atrasadas». */
  label: (n: number) => string;
  href: string;
  tone: 'critical' | 'warning' | 'info';
}

export const INBOX_ITEMS: Record<InboxKey, InboxItemDef> = {
  late: {
    label: (n) => (n === 1 ? 'OT atrasada' : 'OT atrasadas'),
    href: '/operaciones/ordenes-en-proceso',
    tone: 'critical',
  },
  invoice_disputes: {
    label: (n) => (n === 1 ? 'factura de proveedor en disputa' : 'facturas de proveedor en disputa'),
    href: '/operaciones/compras',
    tone: 'critical',
  },
  maintenance: {
    label: (n) => (n === 1 ? 'mantención vencida' : 'mantenciones vencidas'),
    href: '/equipos/ordenes?tab=vencimientos',
    tone: 'warning',
  },
  captures: {
    label: (n) => (n === 1 ? 'captura por revisar' : 'capturas por revisar'),
    href: '/operaciones/captures',
    tone: 'warning',
  },
  signoff: {
    label: (n) => (n === 1 ? 'orden espera el visto bueno del cliente' : 'órdenes esperan el visto bueno del cliente'),
    href: '/comercial/cotizaciones',
    tone: 'info',
  },
  leave: {
    label: (n) => (n === 1 ? 'licencia por aprobar' : 'licencias por aprobar'),
    href: '/personas/consola?tab=asistencia',
    tone: 'info',
  },
};

/** Most urgent first. */
const ORDER: InboxKey[] = ['late', 'invoice_disputes', 'maintenance', 'captures', 'signoff', 'leave'];

const BY_ROLE: Record<AppRole, InboxKey[]> = {
  admin: ORDER,
  manager: ORDER,
  supervisor: ['late', 'maintenance', 'captures', 'signoff'],
  vendedor: ['late', 'signoff'],
  technician: ['maintenance'],
  hr_manager: ['leave'],
};

export function inboxKeysFor(role: AppRole | null | undefined): InboxKey[] {
  return role ? BY_ROLE[role] ?? [] : [];
}
