/**
 * @fileoverview Metadatos compartidos de checklists de mantención --
 * tipo de acción y frecuencia -- usados por el editor, Historial, y la
 * matriz por máquina (equipos/ordenes).
 *
 * `actionType` y `frequency` ya vivían en los datos reales (una migración
 * anterior cargó manuales técnicos de Roland/Ryobi/guillotina con estos
 * campos) pero ningún componente los traducía ni los coloreaba -- de ahí
 * que el módulo se viera plano pese a tener la misma riqueza que las hojas
 * de mantención en papel que ya usa el taller. Confirmado por consulta
 * directa a la base real: los 8 valores de actionType listados abajo son
 * exhaustivos, no hay ningún otro en los 17 checklists reales.
 */

import {
  Search, Sparkles, Droplet, RefreshCw, CheckCircle2, SlidersHorizontal, Wrench, Gauge,
  type LucideIcon,
} from 'lucide-react';

export interface ActionTypeMeta {
  label: string;
  className: string;
  icon: LucideIcon;
}

/**
 * Mismo patrón que priorityColors en MaintenanceChecklistEditor.tsx --
 * clases de Tailwind explícitas por categoría, no el sistema de `tone` de
 * KpiCard (ese es para severidad -- warning/critical/success -- y una
 * acción como "lubricar" no es más o menos severa que "limpiar", sólo
 * distinta).
 */
export const ACTION_TYPE_META: Record<string, ActionTypeMeta> = {
  inspect: {
    label: 'Inspeccionar',
    className: 'border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300',
    icon: Search,
  },
  clean: {
    label: 'Limpiar',
    className: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    icon: Sparkles,
  },
  lubricate: {
    label: 'Lubricar',
    className: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300',
    icon: Droplet,
  },
  replace: {
    label: 'Cambiar',
    className: 'border-fuchsia-500/30 bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
    icon: RefreshCw,
  },
  check: {
    label: 'Verificar',
    className: 'border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300',
    icon: CheckCircle2,
  },
  adjust: {
    label: 'Ajustar',
    className: 'border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-300',
    icon: SlidersHorizontal,
  },
  service: {
    label: 'Servicio técnico',
    className: 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300',
    icon: Wrench,
  },
  fill: {
    label: 'Rellenar nivel',
    className: 'border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-300',
    icon: Gauge,
  },
};

/** Ítems migrados sin actionType (o los 5 checklists semilla que nunca lo tuvieron) -- ni inventa ni oculta, muestra neutro. */
export const ACTION_TYPE_FALLBACK: ActionTypeMeta = {
  label: 'Sin categoría',
  className: 'border-border bg-muted/40 text-muted-foreground',
  icon: Wrench,
};

export function actionTypeMeta(actionType?: string | null): ActionTypeMeta {
  if (!actionType) return ACTION_TYPE_FALLBACK;
  return ACTION_TYPE_META[actionType] ?? ACTION_TYPE_FALLBACK;
}

/** Orden canónico -- de más frecuente a menos, el mismo criterio que usaría el manual en papel. */
export const FREQUENCY_ORDER = [
  'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'as_needed',
] as const;

export const FREQUENCY_LABEL: Record<string, string> = {
  daily: 'Diario',
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
  as_needed: 'Según necesidad',
};

export function frequencyLabel(frequency?: string | null): string {
  if (!frequency) return 'Sin frecuencia';
  return FREQUENCY_LABEL[frequency] ?? frequency;
}

/** Compara dos frecuencias según FREQUENCY_ORDER -- las desconocidas van al final, no rompen el orden de las demás. */
export function compareFrequency(a: string, b: string): number {
  const ia = FREQUENCY_ORDER.indexOf(a as (typeof FREQUENCY_ORDER)[number]);
  const ib = FREQUENCY_ORDER.indexOf(b as (typeof FREQUENCY_ORDER)[number]);
  return (ia === -1 ? FREQUENCY_ORDER.length : ia) - (ib === -1 ? FREQUENCY_ORDER.length : ib);
}
