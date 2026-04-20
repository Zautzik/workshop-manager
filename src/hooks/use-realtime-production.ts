'use client';
/**
 * useRealtimeProduction
 *
 * Subscribes to Supabase Realtime changes on the `ots` and
 * `ot_machine_schedule` tables and invalidates the relevant
 * React Query caches so both Ordenes en Proceso and Hoja de
 * Producción refresh automatically for all connected users.
 *
 * Usage: call once in a parent layout or dashboard component.
 * const { isConnected } = useRealtimeProduction();
 */

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/hooks/use-queries';

export function useRealtimeProduction() {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel('production-floor-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ots' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.ots });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ot_machine_schedule' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['schedule'] });
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
