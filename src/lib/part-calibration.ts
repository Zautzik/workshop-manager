/**
 * @fileoverview Calibración de vida útil de piezas -- ¿la estimación de
 * `machine_parts.expected_life_usage` se parece a lo que de verdad dura la
 * pieza antes de fallar?
 *
 * La "realidad" sale de `maintenance_work_orders.usage_at_creation`: el
 * contador de uso de la máquina al momento en que se creó la orden
 * correctiva para esa pieza (ver comentario en
 * src/app/api/maintenance/work-orders/route.ts, donde se guarda). Nunca se
 * había leído hasta ahora -- esta es la primera pieza (con perdón del juego
 * de palabras) que lo consume.
 *
 * El desafío es la línea base: `machine_parts.last_replaced_usage` es un
 * campo mutable, se pisa cada vez que se registra un cambio, así que no
 * sirve como historial. En cambio, para una pieza con más de una orden
 * correctiva, la lectura de la orden anterior YA ES la línea base real de la
 * siguiente vida -- se reemplazó la pieza poco después de esa falla, y el
 * uso acumulado hasta la falla siguiente es exactamente la resta entre las
 * dos lecturas. Sólo la primera falla conocida de una pieza necesita
 * `last_replaced_usage` como línea base, y sólo si ese reemplazo quedó
 * registrado ANTES de esa falla -- si no, se omite antes que inventar un
 * número.
 */

export interface CalibrationPart {
  id: string;
  name: string;
  machineId: string;
  machineName: string;
  usageUnit: string;
  expectedLifeUsage: number | null;
  lastReplacedUsage: number | null;
  lastReplacedAt: string | null;
}

export interface CalibrationOrder {
  id: string;
  partId: string;
  usageAtCreation: number | null;
  createdAt: string;
}

export interface PartCalibrationReading {
  partId: string;
  partName: string;
  machineName: string;
  usageUnit: string;
  orderId: string;
  observedAt: string;
  expectedLifeUsage: number;
  observedLifeUsage: number;
  /** (observado - esperado) / esperado * 100. Negativo = falló antes de lo previsto. */
  deltaPct: number;
}

/**
 * Una lectura de calibración por pieza -- la más reciente con línea base
 * conocida, no el historial completo, igual que el delta de MTBF de
 * Historial compara sólo la ventana actual contra la anterior.
 */
export function computePartCalibration(
  parts: CalibrationPart[],
  orders: CalibrationOrder[],
): PartCalibrationReading[] {
  const ordersByPart = new Map<string, CalibrationOrder[]>();
  for (const order of orders) {
    if (order.usageAtCreation == null) continue;
    const list = ordersByPart.get(order.partId) ?? [];
    list.push(order);
    ordersByPart.set(order.partId, list);
  }
  for (const list of ordersByPart.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  const readings: PartCalibrationReading[] = [];

  for (const part of parts) {
    if (part.expectedLifeUsage == null || part.expectedLifeUsage <= 0) continue;
    const partOrders = ordersByPart.get(part.id);
    if (!partOrders || partOrders.length === 0) continue;

    let best: PartCalibrationReading | null = null;
    for (let i = 0; i < partOrders.length; i++) {
      const order = partOrders[i];
      const baseline =
        i === 0
          ? part.lastReplacedUsage != null &&
            part.lastReplacedAt != null &&
            part.lastReplacedAt < order.createdAt
            ? part.lastReplacedUsage
            : null
          : partOrders[i - 1].usageAtCreation;

      if (baseline == null || order.usageAtCreation == null) continue;
      const observed = order.usageAtCreation - baseline;
      if (observed <= 0) continue;

      best = {
        partId: part.id,
        partName: part.name,
        machineName: part.machineName,
        usageUnit: part.usageUnit,
        orderId: order.id,
        observedAt: order.createdAt,
        expectedLifeUsage: part.expectedLifeUsage,
        observedLifeUsage: observed,
        deltaPct: Math.round(((observed - part.expectedLifeUsage) / part.expectedLifeUsage) * 1000) / 10,
      };
    }
    if (best) readings.push(best);
  }

  return readings;
}
