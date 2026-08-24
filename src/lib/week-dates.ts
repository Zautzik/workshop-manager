/**
 * La fecha en formato ISO (YYYY-MM-DD) tal como se ve en la zona horaria
 * LOCAL, no en UTC.
 *
 * `date.toISOString()` convierte a UTC primero. En Santiago (UTC-3/-4),
 * cualquier hora entre eso de las 21:00 y medianoche local cae ya en el
 * día SIGUIENTE en UTC. Un botón "Hoy" construido con
 * `toISOString().split('T')[0]` apunta al día equivocado durante esas
 * horas — no es una curiosidad, es fichar la jornada de mañana antes de
 * que termine la de hoy.
 *
 * Tres componentes reimplementaban esto por su cuenta (PlantaBoard,
 * PlanSemanal, HojaProduccion): dos con una corrección manual del offset
 * (`date.getTimezoneOffset()`) que da el resultado correcto, uno con
 * `toISOString()` sin corregir. La versión sin corregir era un bug real y
 * en vivo, no sólo una duplicación (auditoría 2026-08). `date-fns.format`
 * usa los getters locales del Date de por sí, así que no hace falta la
 * aritmética manual — y no hay una segunda copia que pueda volver a
 * desviarse.
 */
import { addDays, format, startOfWeek } from 'date-fns';

export function dateToLocalIso(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** El lunes de la semana que contiene `date`, a medianoche local. */
export function startOfIsoWeek(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

/** Los 7 días de la semana que empieza en `start` (se espera un lunes). */
export function weekDatesFrom(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
