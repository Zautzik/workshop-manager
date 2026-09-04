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

interface RealtimeProductionValue {
  isConnected: boolean;
}

const RealtimeProductionCtx = createContext<RealtimeProductionValue | null>(null);

function invalidateWorkflow(
  queryClient: QueryClient,
  scope: 'ots' | 'schedule' | 'resources' | 'people' | 'hr',
) {
  if (scope === 'ots') {
    queryClient.invalidateQueries({ queryKey: queryKeys.ots });
    return;
  }

  if (scope === 'schedule') {
    queryClient.invalidateQueries({ queryKey: ['schedule'] });
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

/** Monta el channel único. Se pone una vez, en src/app/operaciones/layout.tsx. */
export function RealtimeProductionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel('production-floor-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ots' }, () => invalidateWorkflow(queryClient, 'ots'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ot_machine_schedule' }, () => invalidateWorkflow(queryClient, 'schedule'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workstations' }, () => invalidateWorkflow(queryClient, 'resources'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines' }, () => invalidateWorkflow(queryClient, 'resources'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'worker_assignments' }, () => invalidateWorkflow(queryClient, 'schedule'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => invalidateWorkflow(queryClient, 'people'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => invalidateWorkflow(queryClient, 'people'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workers' }, () => invalidateWorkflow(queryClient, 'people'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'compensation_rates' }, () => invalidateWorkflow(queryClient, 'people'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => invalidateWorkflow(queryClient, 'hr'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_incentives' }, () => invalidateWorkflow(queryClient, 'hr'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hr_documents' }, () => invalidateWorkflow(queryClient, 'hr'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employment_contracts' }, () => invalidateWorkflow(queryClient, 'hr'))
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
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
    throw new Error('useRealtimeProduction se usó fuera de <RealtimeProductionProvider> (ver src/app/operaciones/layout.tsx).');
  }
  return ctx;
}
