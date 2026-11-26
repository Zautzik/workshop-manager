'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { buildPlanInput, type PlanPayload } from '@/lib/production-plan';
import { buildSchedule } from '@/lib/production-scheduler';

/**
 * The production schedule — one computation for every screen that shows it.
 *
 * The plan is not stored: `buildSchedule` turns /api/planificacion (routes,
 * estimates, pins, maintenance) into blocks per machine, in the browser, so
 * the Cronograma can drag and simulate without a round trip. Hoja de
 * Producción used to read the manual pins in `ot_machine_schedule` on its own
 * and showed an empty day while the Cronograma had 28 OTs planned (audit C3,
 * 2026-11-25). Both now call this hook: same data, same function, same blocks.
 */

export function usePlanificacion() {
  return useQuery<PlanPayload>({
    queryKey: ['planificacion'],
    queryFn: async () => {
      const res = await fetch('/api/planificacion');
      if (!res.ok) throw new Error(`No se pudo cargar el programa (${res.status})`);
      return res.json();
    },
    staleTime: 60_000,
    // Sin reintentos largos: con la red caída, tres reintentos de 10 s
    // mostraban "nada programado" durante medio minuto en vez del error.
    retry: 1,
  });
}

export function useNow(stepMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(t);
  }, [stepMs]);
  return now;
}

export function useProductionSchedule() {
  const query = usePlanificacion();
  const now = useNow();
  // Se recalcula con `now` redondeado al cuarto de hora: el programa no tiene
  // por qué moverse cada minuto, y así no se rearma mientras se arrastra.
  const planNow = Math.floor(now / (15 * 60_000)) * 15 * 60_000;
  const plan = useMemo(() => (query.data ? buildPlanInput(query.data) : null), [query.data]);
  const schedule = useMemo(
    () =>
      plan
        ? buildSchedule({ now: planNow, ots: plan.ots, machines: plan.machines, pins: plan.pins, maintenance: plan.maintenance })
        : null,
    [plan, planNow],
  );
  return { ...query, now, planNow, plan, schedule };
}
