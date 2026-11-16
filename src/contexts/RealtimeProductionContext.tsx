'use client';
/**
 * @fileoverview Un único channel de Supabase Realtime para toda la app.
 *
 * `useRealtimeProduction` (src/hooks/use-realtime-production.ts) vivía como un
 * hook que cada consumidor llamaba por su cuenta, con un comentario diciendo
 * "llamar una sola vez" que nada hacía cumplir. Hoy funciona porque los cuatro
 * consumidores (HojaProduccion, OrdenesEnProceso, PlanSemanal, PlantaBoard)
 * viven cada uno en su propia ruta bajo /operaciones y nunca se montan juntos
 * -- pero el día que una pantalla combine dos de ellos (un dashboard de
 * operaciones unificado es un pedido natural), cada uno abriría su PROPIO
 * channel 'production-floor-live', duplicando la suscripción a postgres_changes
 * sobre 13 tablas y multiplicando cada invalidateQueries por cada escritura
 * (auditoría de rendimiento 2026-09-08).
 *
 * Este provider hace que "una sola vez" sea estructural: se monta una vez en
 * el layout de /operaciones, y useRealtimeProduction() pasa a ser una lectura
 * del estado compartido, no la creación de una suscripción nueva.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/hooks/use-workflow-queries';
import { invalidateAfterReview } from '@/hooks/review-cache';

interface RealtimeProductionValue {
  isConnected: boolean;
}

const RealtimeProductionCtx = createContext<RealtimeProductionValue | null>(null);

type Scope = 'ots' | 'schedule' | 'resources' | 'people' | 'hr' | 'thread';

/**
 * Qué tabla refresca qué. UNA lista: agregar una tabla acá es todo lo que hace
 * falta para que el channel la escuche. La tabla además tiene que estar en la
 * publicación `supabase_realtime` (migración 20261116121000) — sin eso Postgres
 * no emite el cambio y la suscripción queda muda sin dar error. Así estuvo este
 * channel entero hasta el 2026-11-16: la publicación estaba vacía.
 *
 * `workstations` y `workers` estaban en esta lista y ya no existen (se
 * fusionaron en `machines` y `employees`, migraciones 20260802120000/140000).
 */
const TABLE_SCOPE: ReadonlyArray<readonly [table: string, scope: Scope]> = [
  ['ots', 'ots'],
  ['ot_machine_schedule', 'schedule'],
  ['worker_assignments', 'schedule'],
  ['machines', 'resources'],
  ['shifts', 'people'],
  ['employees', 'people'],
  ['compensation_rates', 'people'],
  ['leave_requests', 'hr'],
  ['employee_incentives', 'hr'],
  ['hr_documents', 'hr'],
  ['employment_contracts', 'hr'],
  // El hilo dorado: una pasada cerrada y las líneas de costo que produce. Sin
  // estas dos, las horas declaradas en el taller no llegaban a ninguna otra
  // pantalla abierta hasta que alguien recargaba.
  ['ot_stage_reports', 'thread'],
  ['ot_cost_lines', 'thread'],
];

/** Cerrar una pasada escribe varias líneas de costo seguidas: una sola recarga. */
const DEBOUNCE_MS = 300;

function invalidateWorkflow(queryClient: QueryClient, scope: Scope) {
  // Lo que cambia cuando el taller declara horas: la misma lista que usa quien
  // aprueba un parte (review-cache.ts), más las pantallas que derivan del costo.
  if (scope === 'thread') {
    invalidateAfterReview(queryClient);
    queryClient.invalidateQueries({ queryKey: ['planificacion'] });
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
    queryClient.invalidateQueries({ queryKey: ['analytics-trends'] });
    return;
  }

  // El Cronograma (`['planificacion']`) depende de las dos: mover una OT en el
  // Kanban cambia qué etapas le faltan, y fijar un bloque cambia la agenda.
  if (scope === 'ots') {
    queryClient.invalidateQueries({ queryKey: queryKeys.ots });
    queryClient.invalidateQueries({ queryKey: ['planificacion'] });
    return;
  }

  if (scope === 'schedule') {
    queryClient.invalidateQueries({ queryKey: ['schedule'] });
    queryClient.invalidateQueries({ queryKey: ['planificacion'] });
    queryClient.invalidateQueries({ queryKey: queryKeys.assignments() });
    queryClient.invalidateQueries({ queryKey: ['assignments', 'monthlyOvertime'] });
    queryClient.invalidateQueries({ queryKey: queryKeys.workflowWeeklyHours() });
    return;
  }

  if (scope === 'resources') {
    queryClient.invalidateQueries({ queryKey: queryKeys.workstations });
    queryClient.invalidateQueries({ queryKey: ['machines'] });
    queryClient.invalidateQueries({ queryKey: ['schedule'] });
    return;
  }

  if (scope === 'people') {
    queryClient.invalidateQueries({ queryKey: queryKeys.workersByRating });
    queryClient.invalidateQueries({ queryKey: queryKeys.compensationRates() });
    queryClient.invalidateQueries({ queryKey: queryKeys.shifts });
    queryClient.invalidateQueries({ queryKey: queryKeys.assignments() });
    queryClient.invalidateQueries({ queryKey: ['assignments', 'monthlyOvertime'] });
    queryClient.invalidateQueries({ queryKey: queryKeys.workflowWeeklyHours() });
    return;
  }

  queryClient.invalidateQueries({ queryKey: queryKeys.workflowLeaveStatuses() });
  queryClient.invalidateQueries({ queryKey: queryKeys.workflowIncentives() });
  queryClient.invalidateQueries({ queryKey: queryKeys.workflowCertAlerts() });
  queryClient.invalidateQueries({ queryKey: queryKeys.workflowContracts() });
}

/** Monta el channel único. Se pone en el layout de cada sección que muestra datos del taller (operaciones, analitica, equipos); sólo hay una montada a la vez. */
export function RealtimeProductionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Un temporizador por alcance: varias escrituras seguidas de la misma
    // operación terminan en una sola invalidación.
    const pending = new Map<Scope, ReturnType<typeof setTimeout>>();
    const schedule = (scope: Scope) => {
      const running = pending.get(scope);
      if (running) clearTimeout(running);
      pending.set(
        scope,
        setTimeout(() => {
          pending.delete(scope);
          invalidateWorkflow(queryClient, scope);
        }, DEBOUNCE_MS),
      );
    };

    let channel = supabase.channel('production-floor-live');
    for (const [table, scope] of TABLE_SCOPE) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => schedule(scope));
    }
    channel.subscribe((status) => {
      setIsConnected(status === 'SUBSCRIBED');
      // Antes un channel caído sólo apagaba un indicador; ahora queda dicho por qué.
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn(`[realtime] production-floor-live: ${status}. Las pantallas no se actualizarán solas hasta reconectar.`);
      }
    });

    return () => {
      for (const t of pending.values()) clearTimeout(t);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return (
    <RealtimeProductionCtx.Provider value={{ isConnected }}>
      {children}
    </RealtimeProductionCtx.Provider>
  );
}

/** Lee el estado del channel único -- no crea una suscripción nueva. */
export function useRealtimeProductionContext(): RealtimeProductionValue {
  const ctx = useContext(RealtimeProductionCtx);
  if (!ctx) {
    throw new Error('useRealtimeProduction se usó fuera de <RealtimeProductionProvider> (ver los layouts de operaciones, analitica y equipos).');
  }
  return ctx;
}
