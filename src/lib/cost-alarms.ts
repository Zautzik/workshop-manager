/**
 * Cuándo un trabajo tiene que dar la alarma.
 *
 * Había alertas de sobrecosto, pero medían UNA sola cosa: costo real contra
 * costo estimado. Eso detecta que se presupuestó mal — un problema de proceso.
 * No detecta lo que de verdad duele, que es distinto:
 *
 *   sobrecosto  →  gastamos más de lo que calculamos      (error de estimación)
 *   PÉRDIDA     →  gastamos más de lo que cobramos        (el trabajo saca plata)
 *
 * Un trabajo puede estar perfectamente dentro del presupuesto y aun así perder
 * plata, si el presupuesto ya era más alto que el precio. Y al revés: puede
 * pasarse un 40% del estimado y seguir dejando margen. Son dos preguntas y hay
 * que hacer las dos.
 *
 * REGLA QUE NO SE NEGOCIA: no se alarma sobre datos que no se sostienen. Una OT
 * sin ninguna línea de costo real tiene margen = ingreso = 100% de utilidad;
 * gritar "excelente margen" ahí sería tan falso como gritar "pérdida". Esas
 * quedan en `sin_datos` y no disparan nada.
 *
 * Puro y testeable.
 */

export type AlarmLevel =
  /** Costo real por encima del ingreso: el trabajo saca plata del bolsillo. */
  | 'perdida'
  /** Deja margen, pero por debajo del piso que el taller definió. */
  | 'margen_critico'
  /** Se pasó del costo estimado más allá del umbral. */
  | 'sobrecosto'
  /** No hay costo real suficiente para afirmar nada. */
  | 'sin_datos'
  | 'ok';

export interface AlarmInput {
  ot_id: string;
  ot_number: string | null;
  client_name: string | null;
  revenue: number;
  estimated_cost: number;
  actual_cost: number;
  /** De cost-rollup: la OT no tiene costo real, o está sembrada. */
  unreliable: boolean;
}

export interface AlarmThresholds {
  /** % por sobre el estimado que dispara sobrecosto. */
  overrunPct: number;
  /** Margen mínimo aceptable, en %. Por debajo, alarma. */
  minMarginPct: number;
}

export const DEFAULT_THRESHOLDS: AlarmThresholds = {
  overrunPct: 15,
  minMarginPct: 10,
};

export interface Alarm {
  ot_id: string;
  ot_number: string | null;
  client_name: string | null;
  level: AlarmLevel;
  /** Todas las razones, no sólo la peor: un trabajo puede fallar por dos lados. */
  reasons: string[];
  revenue: number;
  actual_cost: number;
  estimated_cost: number;
  /** Negativo cuando pierde plata. */
  margin_amount: number;
  margin_pct: number | null;
  /** Cuánto se pasó del estimado, en % y en plata. */
  overrun_pct: number | null;
  overrun_amount: number;
  /** Para ordenar: primero lo que más plata cuesta. */
  severity: number;
}

/** Orden de atención. La pérdida manda siempre. */
export const LEVEL_PRIORITY: Record<AlarmLevel, number> = {
  perdida: 0,
  margen_critico: 1,
  sobrecosto: 2,
  sin_datos: 3,
  ok: 4,
};

export const LEVEL_LABEL: Record<AlarmLevel, string> = {
  perdida: 'Pierde plata',
  margen_critico: 'Margen bajo el piso',
  sobrecosto: 'Sobre el costo estimado',
  sin_datos: 'Sin costo real cargado',
  ok: 'En regla',
};

export function evaluateAlarm(
  input: AlarmInput,
  thresholds: AlarmThresholds = DEFAULT_THRESHOLDS
): Alarm {
  const revenue = Number(input.revenue ?? 0);
  const actual = Number(input.actual_cost ?? 0);
  const estimated = Number(input.estimated_cost ?? 0);

  const margin_amount = revenue - actual;
  const margin_pct = revenue > 0 ? Math.round((margin_amount / revenue) * 1000) / 10 : null;
  const overrun_amount = actual - estimated;
  const overrun_pct = estimated > 0 ? Math.round(((actual - estimated) / estimated) * 1000) / 10 : null;

  const base = {
    ot_id: input.ot_id,
    ot_number: input.ot_number,
    client_name: input.client_name,
    revenue, actual_cost: actual, estimated_cost: estimated,
    margin_amount, margin_pct, overrun_pct, overrun_amount,
  };

  // Sin costo real no se afirma nada — ni bueno ni malo.
  if (input.unreliable || actual <= 0) {
    return {
      ...base, level: 'sin_datos', severity: 0,
      reasons: ['No hay costo real cargado: no se puede saber si este trabajo dejó plata.'],
    };
  }

  const reasons: string[] = [];
  let level: AlarmLevel = 'ok';

  // 1. ¿Pierde plata? Es la pregunta que manda.
  if (revenue > 0 && actual > revenue) {
    level = 'perdida';
    reasons.push(
      `Costó ${fmt(actual)} y se cobró ${fmt(revenue)}: este trabajo perdió ${fmt(Math.abs(margin_amount))}.`
    );
  } else if (revenue > 0 && margin_pct !== null && margin_pct < thresholds.minMarginPct) {
    level = 'margen_critico';
    reasons.push(
      `Margen de ${margin_pct}%, bajo el piso de ${thresholds.minMarginPct}% que definió el taller.`
    );
  }

  // 2. ¿Se pasó del presupuesto? Se acumula, no reemplaza.
  if (overrun_pct !== null && overrun_pct >= thresholds.overrunPct) {
    if (level === 'ok') level = 'sobrecosto';
    reasons.push(
      `Se estimó ${fmt(estimated)} y costó ${fmt(actual)}: ${overrun_pct}% por sobre lo calculado.`
    );
  }

  if (revenue <= 0) {
    reasons.push('La OT no tiene precio cargado, así que el margen no se puede calcular.');
    if (level === 'ok') level = 'sin_datos';
  }

  if (reasons.length === 0) {
    reasons.push(
      margin_pct !== null
        ? `Margen de ${margin_pct}%, dentro de lo esperado.`
        : 'Sin observaciones.'
    );
  }

  // La severidad ordena por PLATA, no por porcentaje: una pérdida de $6.000.000
  // pesa más que una de $50.000 aunque el porcentaje diga lo contrario.
  const severity =
    level === 'perdida' ? Math.abs(margin_amount)
      : level === 'margen_critico' ? Math.max(0, (thresholds.minMarginPct - (margin_pct ?? 0)) / 100 * revenue)
        : level === 'sobrecosto' ? Math.max(0, overrun_amount)
          : 0;

  return { ...base, level, reasons, severity };
}

export function compareAlarms(a: Alarm, b: Alarm): number {
  const byLevel = LEVEL_PRIORITY[a.level] - LEVEL_PRIORITY[b.level];
  if (byLevel !== 0) return byLevel;
  return b.severity - a.severity;
}

/** Sólo lo que exige una acción. */
export function actionableAlarms(alarms: Alarm[]): Alarm[] {
  return alarms
    .filter((a) => a.level === 'perdida' || a.level === 'margen_critico' || a.level === 'sobrecosto')
    .sort(compareAlarms);
}

export function summarizeAlarms(alarms: Alarm[]) {
  const perdida = alarms.filter((a) => a.level === 'perdida');
  const dineroPerdido = perdida.reduce((acc, a) => acc + Math.abs(a.margin_amount), 0);
  return {
    total: alarms.length,
    perdida: perdida.length,
    margen_critico: alarms.filter((a) => a.level === 'margen_critico').length,
    sobrecosto: alarms.filter((a) => a.level === 'sobrecosto').length,
    sin_datos: alarms.filter((a) => a.level === 'sin_datos').length,
    /** Plata efectivamente perdida en los trabajos en pérdida. */
    dinero_perdido: Math.round(dineroPerdido),
    headline:
      perdida.length > 0
        ? `${perdida.length} trabajo(s) perdieron ${fmt(dineroPerdido)} en total.`
        : alarms.some((a) => a.level === 'margen_critico')
          ? 'Ningún trabajo en pérdida, pero hay márgenes bajo el piso.'
          : 'Ningún trabajo en pérdida.',
  };
}

function fmt(n: number): string {
  return `$${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(Math.round(n))}`;
}
