/**
 * Cuándo vence una pauta de mantenimiento — por calendario o por uso.
 *
 * Una pauta puede vencer de dos maneras y el taller necesita las dos:
 *
 *   · Por CALENDARIO. Aunque la máquina esté parada, el aceite se degrada y las
 *     gomas se secan. "Cada 6 meses" tiene sentido aunque no se haya impreso.
 *   · Por USO. Una Ryobi se lubrica cada tantas impresiones y una Roland cada
 *     tantas horas, corra el calendario que corra.
 *
 * Vence lo que ocurra PRIMERO. `maintenance_schedules` ya tenía frequency_days;
 * frequency_usage se agregó en julio y nada lo consumía — de hecho nada
 * consumía la tabla entera: 12 pautas reales cargadas y ninguna pantalla que
 * las mostrara.
 *
 * Puro y testeable, como el resto de la lógica de negocio del proyecto.
 */

import { compareFrequency } from './maintenance-checklist-meta';

export type DueStatus =
  /** Ya se pasó, por calendario o por uso. */
  | 'vencida'
  /** Vence dentro de la ventana de aviso. */
  | 'proxima'
  /** Al día. */
  | 'al_dia'
  /** Falta el dato para poder decirlo. */
  | 'sin_datos';

/** Por cuál de los dos caminos vence primero. */
export type DueDriver = 'calendario' | 'uso' | null;

export interface ScheduleInput {
  frequencyDays?: number | null;
  nextMaintenanceDate?: string | null;
  /** Cada cuánto uso vence, en la unidad de la máquina. */
  frequencyUsage?: number | null;
  /** Lectura del contador en el último mantenimiento. */
  lastMaintenanceUsage?: number | null;
  /** Lectura actual. */
  usageCounter?: number | null;
  /** Ritmo de consumo, para proyectar el vencimiento por uso a una fecha. */
  usagePerDay?: number | null;
}

export interface DueResult {
  status: DueStatus;
  driver: DueDriver;
  /** Días hasta vencer por calendario. Negativo = pasado. */
  daysByCalendar: number | null;
  /** Uso que falta para vencer por uso. Negativo = pasado. */
  usageRemaining: number | null;
  /** Días hasta vencer por uso, si hay ritmo. */
  daysByUsage: number | null;
  /** El menor de los dos, que es cuando realmente vence. */
  daysUntilDue: number | null;
  reason: string;
}

/** Cuántos días antes se considera "próxima". */
export const WARNING_WINDOW_DAYS = 7;

export function evaluateSchedule(input: ScheduleInput, opts: { today?: Date } = {}): DueResult {
  const today = opts.today ?? new Date();
  const {
    nextMaintenanceDate = null,
    frequencyUsage = null,
    lastMaintenanceUsage = null,
    usageCounter = null,
    usagePerDay = null,
  } = input;

  // ── Camino del calendario ──
  let daysByCalendar: number | null = null;
  if (nextMaintenanceDate) {
    const next = new Date(nextMaintenanceDate);
    if (!Number.isNaN(next.getTime())) {
      daysByCalendar = Math.floor((next.getTime() - today.getTime()) / 86_400_000);
    }
  }

  // ── Camino del uso ──
  let usageRemaining: number | null = null;
  let daysByUsage: number | null = null;
  if (frequencyUsage && frequencyUsage > 0 && usageCounter != null) {
    const desdeUltimo = Math.max(0, usageCounter - (lastMaintenanceUsage ?? 0));
    usageRemaining = frequencyUsage - desdeUltimo;
    if (usagePerDay && usagePerDay > 0) {
      daysByUsage = Math.floor(usageRemaining / usagePerDay);
    }
  }

  if (daysByCalendar == null && usageRemaining == null) {
    return {
      status: 'sin_datos', driver: null,
      daysByCalendar: null, usageRemaining: null, daysByUsage: null, daysUntilDue: null,
      reason: 'La pauta no declara ni fecha ni frecuencia de uso: no se puede decir cuándo vence.',
    };
  }

  // ── ¿Ya venció por alguno de los dos? ──
  const vencidaPorUso = usageRemaining != null && usageRemaining <= 0;
  const vencidaPorCalendario = daysByCalendar != null && daysByCalendar <= 0;

  if (vencidaPorUso || vencidaPorCalendario) {
    // Si vencieron los dos, manda el que se pasó más.
    const driver: DueDriver =
      vencidaPorUso && vencidaPorCalendario
        ? (daysByUsage ?? 0) <= (daysByCalendar ?? 0) ? 'uso' : 'calendario'
        : vencidaPorUso ? 'uso' : 'calendario';

    return {
      status: 'vencida', driver, daysByCalendar, usageRemaining, daysByUsage,
      daysUntilDue: Math.min(daysByCalendar ?? Infinity, daysByUsage ?? Infinity) === Infinity
        ? null
        : Math.min(daysByCalendar ?? Infinity, daysByUsage ?? Infinity),
      reason: driver === 'uso'
        ? `Vencida por uso: la máquina superó en ${formatNum(Math.abs(usageRemaining ?? 0))} el intervalo de la pauta.`
        : `Vencida por calendario: hace ${Math.abs(daysByCalendar ?? 0)} días que debía hacerse.`,
    };
  }

  // ── Todavía no vence: cuál llega primero ──
  const candidatos: Array<{ dias: number; driver: DueDriver }> = [];
  if (daysByCalendar != null) candidatos.push({ dias: daysByCalendar, driver: 'calendario' });
  if (daysByUsage != null) candidatos.push({ dias: daysByUsage, driver: 'uso' });

  if (candidatos.length === 0) {
    // Hay frecuencia de uso pero no ritmo: se sabe cuánto falta, no cuándo.
    return {
      status: 'sin_datos', driver: null, daysByCalendar, usageRemaining, daysByUsage: null,
      daysUntilDue: null,
      reason: `Faltan ${formatNum(usageRemaining ?? 0)} de uso, pero sin lecturas del contador no se puede traducir a fecha.`,
    };
  }

  const primero = candidatos.reduce((a, b) => (a.dias <= b.dias ? a : b));

  return {
    status: primero.dias <= WARNING_WINDOW_DAYS ? 'proxima' : 'al_dia',
    driver: primero.driver,
    daysByCalendar, usageRemaining, daysByUsage,
    daysUntilDue: primero.dias,
    reason: primero.driver === 'uso'
      ? `Vence en ${primero.dias} días por uso (faltan ${formatNum(usageRemaining ?? 0)}).`
      : `Vence en ${primero.dias} días por calendario.`,
  };
}

export const DUE_STATUS_LABEL: Record<DueStatus, string> = {
  vencida: 'Vencida',
  proxima: 'Próxima',
  al_dia: 'Al día',
  sin_datos: 'Sin datos',
};

export const DUE_PRIORITY: Record<DueStatus, number> = {
  vencida: 0, proxima: 1, sin_datos: 2, al_dia: 3,
};

export function compareDue(a: DueResult, b: DueResult): number {
  const s = DUE_PRIORITY[a.status] - DUE_PRIORITY[b.status];
  if (s !== 0) return s;
  return (a.daysUntilDue ?? Infinity) - (b.daysUntilDue ?? Infinity);
}

function formatNum(n: number): string {
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(n);
}

export interface AdvanceScheduleInput {
  /** Siempre presente en la fila (NOT NULL, default 30) -- toda pauta tiene un tope de calendario aunque su lado fuerte sea el uso. */
  frequencyDays: number;
  completedAt: Date;
  /** Lectura del contador al completar. Ausente si la máquina no tiene bitácora de uso. */
  usageAtCompletion?: number | null;
}

/**
 * El reloj de una pauta al completar la orden que la atendió.
 *
 * Cuenta desde HOY, no desde el vencimiento anterior: si la pauta llevaba dos
 * semanas vencida y recién ahora se hizo, la próxima no hereda ese atraso —
 * arrastrarlo sería castigar la próxima vez por haber llegado tarde esta vez.
 *
 * `last_maintenance_usage` se omite del resultado (no se manda null) cuando
 * no hay lectura: un `.update()` parcial que no lo incluye deja la columna
 * como estaba, en vez de borrar el último dato real que sí se tenía.
 */
export function advanceSchedule(input: AdvanceScheduleInput): {
  last_maintenance_date: string;
  last_maintenance_usage?: number;
  next_maintenance_date: string;
} {
  const { frequencyDays, completedAt, usageAtCompletion } = input;
  const next = new Date(completedAt.getTime() + frequencyDays * 86_400_000);

  const result: { last_maintenance_date: string; last_maintenance_usage?: number; next_maintenance_date: string } = {
    last_maintenance_date: completedAt.toISOString(),
    next_maintenance_date: next.toISOString(),
  };
  if (usageAtCompletion != null) {
    result.last_maintenance_usage = usageAtCompletion;
  }
  return result;
}

export type CronOrderAction =
  /** No hay orden abierta todavía para esta pauta: crear una nueva. */
  | 'create'
  /** Ya existe, pero el aviso anterior no se pudo mandar (notified_at nulo): reintentar el aviso, no crear otra orden. */
  | 'retry_notify'
  /** Ya existe y ya se avisó: nada que hacer. */
  | 'skip';

/**
 * Extraída de la ruta del cron para poder testear la decisión sin invocar
 * notifyScheduleDue de verdad -- eso manda WhatsApp/notificaciones reales a
 * personas reales, así que no es algo que un test (ni una verificación en
 * vivo) deba disparar sólo para confirmar la rama que toma.
 */
export function decideCronOrderAction(
  existing: { id: string; notified_at: string | null } | null,
): CronOrderAction {
  if (!existing) return 'create';
  return existing.notified_at ? 'skip' : 'retry_notify';
}

export interface ScheduleForFrequencyGrouping {
  checklist_frequency: string | null;
  due: { status: DueStatus };
}

export interface DueFrequencyBucket<T> {
  frequency: string;
  schedules: T[];
}

/**
 * La hoja de mantención en papel agrupa por cadencia -- semanal, quincenal,
 * mensual -- para que alguien vea de un vistazo qué le toca esta semana sin
 * leer máquina por máquina. Esto traduce esa intención sin copiar su
 * mecanismo (un casillero por día de la semana): agrupa las pautas ya
 * vencidas o próximas por la frecuencia de SU checklist -- no por
 * frequency_days/frequency_usage, que son números, no una cadencia con
 * nombre -- usando FREQUENCY_ORDER (maintenance-checklist-meta.ts) para el
 * orden de las columnas.
 *
 * Una pauta sin checklist no tiene cadencia que mostrar acá -- ya aparece en
 * la lista plana de Vencimientos con su propio aviso de "sin checklist".
 */
export function groupDueSchedulesByFrequency<T extends ScheduleForFrequencyGrouping>(
  schedules: T[],
): DueFrequencyBucket<T>[] {
  const due = schedules.filter(
    (s) => (s.due.status === 'vencida' || s.due.status === 'proxima') && s.checklist_frequency,
  );

  const order: string[] = [];
  const byFrequency = new Map<string, T[]>();
  for (const s of due) {
    const freq = s.checklist_frequency!;
    if (!byFrequency.has(freq)) {
      byFrequency.set(freq, []);
      order.push(freq);
    }
    byFrequency.get(freq)!.push(s);
  }

  return order
    .sort(compareFrequency)
    .map((frequency) => ({ frequency, schedules: byFrequency.get(frequency)! }));
}
