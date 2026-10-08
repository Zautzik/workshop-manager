import { AlertTriangle, PackageX, Ship, ShoppingCart, HelpCircle, CheckCircle2 } from 'lucide-react';
import { type PartStatus } from '@/lib/part-procurement';

export interface MachineRow {
  id: string;
  name: string;
  type: string;
  usage_unit: string;
  usage_counter: number;
}

export interface SystemRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
}

export interface PartRow {
  id: string;
  machine_id: string;
  system_id: string;
  name: string;
  part_number: string | null;
  position: string | null;
  quantity_installed: number;
  criticality: string;
  lead_time_days: number | null;
  preferred_supplier: string | null;
  min_stock: number;
  is_imported: boolean;
  expected_life_usage: number | null;
  last_replaced_at: string | null;
  usage_unit: string;
  current_stock: number | null;
  suggested_min_stock: number | null;
  machine_systems: SystemRow | null;
  inventory_items: { id: string; sku: string; name: string; unit: string } | null;
  on_order: { oc_number: string | null; supplier: string; expected_date: string | null } | null;
  health: {
    status: PartStatus;
    lifeUsedPct: number | null;
    remainingUsage: number | null;
    daysRemaining: number | null;
    effectiveLeadDays: number | null;
    slackDays: number | null;
    reason: string;
  };
}

export interface FleetPartRow extends PartRow {
  machines: { id: string; name: string; type: string } | null;
}

export interface EmpleadoRow { id: string; full_name: string }

export interface TemplateItem {
  system: string;
  system_id: string;
  system_name: string;
  name: string;
  criticality: string;
  position?: string;
  note?: string;
  already_present: boolean;
}

export const STATUS_STYLE: Record<PartStatus, { badge: string; bar: string; icon: typeof AlertTriangle }> = {
  vencida:     { badge: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',        bar: 'bg-red-500',    icon: PackageX },
  atrasado:    { badge: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30', bar: 'bg-orange-500', icon: Ship },
  pedir_ahora: { badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30', bar: 'bg-amber-500',  icon: ShoppingCart },
  sin_datos:   { badge: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30', bar: 'bg-slate-400',  icon: HelpCircle },
  ok:          { badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30', bar: 'bg-emerald-500', icon: CheckCircle2 },
};

export const CRITICALITY_STYLE: Record<string, string> = {
  critica: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  alta:    'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  media:   'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  baja:    'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30',
};

export const TONE: Record<string, string> = {
  red: 'text-red-600 dark:text-red-400',
  orange: 'text-orange-600 dark:text-orange-400',
  amber: 'text-amber-600 dark:text-amber-400',
  slate: 'text-slate-500 dark:text-slate-400',
};

export const URGENCY_COLOR: Record<string, string> = {
  vencida: '#ef4444',
  atrasado: '#f97316',
  pedir_ahora: '#f59e0b',
};

export const nf = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
