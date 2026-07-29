/**
 * Cuándo hay que pedir un repuesto — que no es lo mismo que cuándo se rompe.
 *
 * Un plan de mantenimiento que sólo dice "esta mantilla dura 8 millones de
 * impresiones" es información muerta: no dice si hay que comprarla hoy. La
 * pregunta operativa tiene tres partes y el taller sólo tenía una:
 *
 *   1. cuánta vida le queda a la pieza      → contador de la máquina
 *   2. a qué ritmo se consume esa vida      → bitácora de lecturas
 *   3. cuánto demora el repuesto en llegar  → lead_time_days
 *
 * Con las tres, "le quedan 2,1 millones de impresiones" se convierte en "se
 * cae el 12 de septiembre, y el repuesto demora 60 días: ya vas tarde".
 *
 * DOS UNIDADES, UN SOLO MODELO. La Ryobi cuenta impresiones y la Roland cuenta
 * horas. Acá no se convierte nada ni se asume ninguna unidad: la vida útil, el
 * contador y el ritmo vienen todos en la unidad de LA MÁQUINA, así que la
 * aritmética es la misma y el resultado sale en días, que es la única unidad
 * en la que se compra.
 *
 * Puro — sin I/O, sin Supabase — para poder testearlo como el motor de costeo.
 */

export type PartCriticality = 'critica' | 'alta' | 'media' | 'baja';

export type PartStatus =
  /** Falta vida útil declarada o falta ritmo: no se puede afirmar nada. */
  | 'sin_datos'
  /** Ya consumió su vida útil. */
  | 'vencida'
  /** Aunque se pida hoy, llega después de que la pieza falle. */
  | 'atrasado'
  /** Es el momento de emitir la orden de compra. */
  | 'pedir_ahora'
  /** Hay holgura. */
  | 'ok';

export interface PartProcurementInput {
  /** Lectura actual del contador de la máquina, en su unidad. */
  usageCounter: number;
  /** Lectura al momento del último cambio. null = nunca se cambió. */
  lastReplacedUsage?: number | null;
  /** Vida útil esperada, en la misma unidad. null = no declarada. */
  expectedLifeUsage?: number | null;
  /** Ritmo de consumo por día. null = sin lecturas suficientes. */
  usagePerDay?: number | null;
  /** Días de reposición del proveedor. */
  leadTimeDays?: number | null;
  criticality?: PartCriticality;
  /** Importado: aduana y flete agregan holgura que nadie recuerda al pedir. */
  isImported?: boolean;
}

export interface PartProcurementResult {
  status: PartStatus;
  /** Uso acumulado desde el último cambio. */
  usageSinceReplacement: number;
  /** Porcentaje de vida consumida. null si no hay vida útil declarada. */
  lifeUsedPct: number | null;
  /** Uso que le queda antes de agotar su vida. null si no hay vida declarada. */
  remainingUsage: number | null;
  /** Días hasta agotarse al ritmo actual. null si falta vida útil o ritmo. */
  daysRemaining: number | null;
  /** Lead time + holgura por criticidad e importación. */
  effectiveLeadDays: number | null;
  /** Días que quedan para emitir la compra sin llegar tarde. Negativo = tarde. */
  slackDays: number | null;
  /** Explicación en una línea, lista para mostrar. */
  reason: string;
}

/**
 * Holgura sobre el lead time según criticidad. No es adorno: si la pieza para
 * la única offset del taller, llegar "justo a tiempo" ya es tarde — cualquier
 * atraso del proveedor se paga con la prensa detenida.
 */
export const SAFETY_DAYS: Record<PartCriticality, number> = {
  critica: 30,
  alta: 15,
  media: 7,
  baja: 0,
};

/** Aduana, naviera y despacho. Conservador a propósito. */
export const IMPORT_BUFFER_DAYS = 21;

/** Lead time supuesto cuando el proveedor nunca se registró. */
export const DEFAULT_LEAD_TIME_DAYS = 15;

export function evaluatePart(input: PartProcurementInput): PartProcurementResult {
  const {
    usageCounter,
    lastReplacedUsage = null,
    expectedLifeUsage = null,
    usagePerDay = null,
    leadTimeDays = null,
    criticality = 'media',
    isImported = false,
  } = input;

  const baseline = lastReplacedUsage ?? 0;
  const usageSinceReplacement = Math.max(0, usageCounter - baseline);

  const hasLife = typeof expectedLifeUsage === 'number' && expectedLifeUsage > 0;
  const lifeUsedPct = hasLife
    ? Math.round((usageSinceReplacement / expectedLifeUsage!) * 1000) / 10
    : null;
  const remainingUsage = hasLife
    ? Math.max(0, expectedLifeUsage! - usageSinceReplacement)
    : null;

  const effectiveLeadDays =
    (leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS) +
    SAFETY_DAYS[criticality] +
    (isImported ? IMPORT_BUFFER_DAYS : 0);

  // Vencida se puede afirmar sin ritmo: el contador ya pasó la vida útil.
  if (hasLife && remainingUsage === 0) {
    return {
      status: 'vencida',
      usageSinceReplacement,
      lifeUsedPct,
      remainingUsage,
      daysRemaining: 0,
      effectiveLeadDays,
      slackDays: -effectiveLeadDays,
      reason: 'Superó su vida útil. Reemplazar y revisar por qué no se anticipó.',
    };
  }

  if (!hasLife) {
    return {
      status: 'sin_datos',
      usageSinceReplacement,
      lifeUsedPct: null,
      remainingUsage: null,
      daysRemaining: null,
      effectiveLeadDays,
      slackDays: null,
      reason: 'Sin vida útil declarada: no se puede anticipar el reemplazo.',
    };
  }

  const hasRate = typeof usagePerDay === 'number' && usagePerDay > 0;
  if (!hasRate) {
    return {
      status: 'sin_datos',
      usageSinceReplacement,
      lifeUsedPct,
      remainingUsage,
      daysRemaining: null,
      effectiveLeadDays,
      slackDays: null,
      reason: `Le queda ${formatUsage(remainingUsage!)} de vida, pero sin lecturas del contador no hay ritmo para traducirlo a fecha.`,
    };
  }

  const daysRemaining = Math.floor(remainingUsage! / usagePerDay!);
  const slackDays = daysRemaining - effectiveLeadDays;

  if (slackDays < 0) {
    return {
      status: 'atrasado',
      usageSinceReplacement,
      lifeUsedPct,
      remainingUsage,
      daysRemaining,
      effectiveLeadDays,
      slackDays,
      reason: `Se agota en ${daysRemaining} días y reponerla toma ${effectiveLeadDays}. Pidiéndola hoy llega ${Math.abs(slackDays)} días tarde.`,
    };
  }

  if (slackDays <= 14) {
    return {
      status: 'pedir_ahora',
      usageSinceReplacement,
      lifeUsedPct,
      remainingUsage,
      daysRemaining,
      effectiveLeadDays,
      slackDays,
      reason: `Se agota en ${daysRemaining} días. Quedan ${slackDays} días para emitir la compra sin llegar tarde.`,
    };
  }

  return {
    status: 'ok',
    usageSinceReplacement,
    lifeUsedPct,
    remainingUsage,
    daysRemaining,
    effectiveLeadDays,
    slackDays,
    reason: `Se agota en ${daysRemaining} días; hay ${slackDays} días de holgura antes de tener que pedirla.`,
  };
}

/**
 * Stock mínimo sugerido: cuántas unidades hay que tener para cubrir el lead
 * time al ritmo real de consumo. Con repuestos escasos, el mínimo lo fija el
 * PLAZO, no el precio — una pieza barata que demora tres meses justifica más
 * stock que una cara que llega en una semana.
 */
export function suggestedMinStock(input: PartProcurementInput & { quantityInstalled?: number }): number | null {
  const { expectedLifeUsage = null, usagePerDay = null, quantityInstalled = 1 } = input;
  if (!expectedLifeUsage || expectedLifeUsage <= 0) return null;
  if (!usagePerDay || usagePerDay <= 0) return null;

  const effectiveLeadDays =
    (input.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS) +
    SAFETY_DAYS[input.criticality ?? 'media'] +
    (input.isImported ? IMPORT_BUFFER_DAYS : 0);

  // Vida útil de un juego expresada en días, al ritmo actual.
  const lifeInDays = expectedLifeUsage / usagePerDay;
  // Cuántos juegos se consumen mientras dura la reposición.
  const consumedDuringLead = (effectiveLeadDays / lifeInDays) * quantityInstalled;

  // Una crítica nunca debería quedar en cero.
  const floor = (input.criticality ?? 'media') === 'critica' ? 1 : 0;
  return Math.max(floor, Math.ceil(consumedDuringLead));
}

/** Orden de atención: lo que primero deja la máquina parada, primero. */
export const STATUS_PRIORITY: Record<PartStatus, number> = {
  vencida: 0,
  atrasado: 1,
  pedir_ahora: 2,
  sin_datos: 3,
  ok: 4,
};

export function comparePartUrgency(a: PartProcurementResult, b: PartProcurementResult): number {
  const byStatus = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
  if (byStatus !== 0) return byStatus;
  // Dentro del mismo estado, primero el que tiene menos holgura.
  const sa = a.slackDays ?? Number.POSITIVE_INFINITY;
  const sb = b.slackDays ?? Number.POSITIVE_INFINITY;
  return sa - sb;
}

function formatUsage(n: number): string {
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(n);
}

/** Etiquetas en español para la UI, en un solo lugar. */
export const STATUS_LABEL: Record<PartStatus, string> = {
  vencida: 'Vencida',
  atrasado: 'Pedido atrasado',
  pedir_ahora: 'Pedir ahora',
  sin_datos: 'Sin datos',
  ok: 'En regla',
};

export const USAGE_UNIT_LABEL: Record<string, string> = {
  impressions: 'impresiones',
  hours: 'horas',
  kilometers: 'km',
  cycles: 'ciclos',
};

export const USAGE_UNIT_SHORT: Record<string, string> = {
  impressions: 'impr.',
  hours: 'h',
  kilometers: 'km',
  cycles: 'ciclos',
};
