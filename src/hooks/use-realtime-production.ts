'use client';
/**
 * useRealtimeProduction
 *
 * Subscribes to Supabase Realtime changes on the `ots` and
 * workflow-related tables and invalidates relevant React Query
 * caches so workflow screens update from push events instead of
 * short polling intervals.
 *
 * Usage: call once in a parent layout or dashboard component.
 * const { isConnected } = useRealtimeProduction();
 */

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/hooks/use-workflow-queries';

export function useRealtimeProduction() {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const invalidateWorkflow = (scope: 'ots' | 'schedule' | 'resources' | 'people' | 'hr') => {
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
    };

    const channel = supabase
      .channel('production-floor-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ots' },
        () => {
          invalidateWorkflow('ots');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ot_machine_schedule' },
        () => {
          invalidateWorkflow('schedule');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workstations' },
        () => {
          invalidateWorkflow('resources');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'machines' },
        () => {
          invalidateWorkflow('resources');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'worker_assignments' },
        () => {
          invalidateWorkflow('schedule');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        () => {
          invalidateWorkflow('people');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employees' },
        () => {
          invalidateWorkflow('people');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workers' },
        () => {
          invalidateWorkflow('people');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'compensation_rates' },
        () => {
          invalidateWorkflow('people');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leave_requests' },
        () => {
          invalidateWorkflow('hr');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employee_incentives' },
        () => {
          invalidateWorkflow('hr');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hr_documents' },
        () => {
          invalidateWorkflow('hr');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employment_contracts' },
        () => {
          invalidateWorkflow('hr');
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { isConnected };
}
