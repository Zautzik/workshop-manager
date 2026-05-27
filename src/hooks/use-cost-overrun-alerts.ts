'use client';

/**
 * useCostOverrunAlerts
 *
 * Monitors OTs where actual_cost > estimated_cost * threshold (default 1.15 = +15%).
 * For each new overrun found, writes a notification row to Supabase so the
 * NotificationCenter picks it up via realtime.
 *
 * This hook is meant to be mounted once in a layout (e.g. AppShell) for admin/manager roles.
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useOTs } from '@/hooks/use-operations-queries';

const OVERRUN_THRESHOLD = 1.15; // 15% over estimate

export function useCostOverrunAlerts() {
  const { user, role } = useAuth();
  const { data: ots = [] } = useOTs();
  const alertedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) return;
    if (role !== 'admin' && role !== 'manager') return;
    if (!ots || (ots as any[]).length === 0) return;

    const overruns = (ots as any[]).filter(ot => {
      const estimated = parseFloat(ot.estimated_cost ?? ot.estimated_amount ?? 0);
      const actual    = parseFloat(ot.actual_cost ?? ot.actual_amount ?? 0);
      return estimated > 0 && actual > estimated * OVERRUN_THRESHOLD;
    });

    overruns.forEach(async ot => {
      const key = `overrun-${ot.id}`;
      if (alertedRef.current.has(key)) return;
      alertedRef.current.add(key);

      const estimated = parseFloat(ot.estimated_cost ?? ot.estimated_amount ?? 0);
      const actual    = parseFloat(ot.actual_cost ?? ot.actual_amount ?? 0);
      const pct       = Math.round(((actual - estimated) / estimated) * 100);

      try {
        await supabase
          .from('notifications')
          .insert({
            user_id:       user.id,
            type:          'cost_overrun' as any,
            title:         `⚠️ Desvío de costo: ${ot.ot_number ?? ot.id}`,
            message:       `OT "${ot.ot_number ?? ot.id}" supera el presupuesto en ${pct}%. Estimado: $${estimated.toFixed(0)} — Real: $${actual.toFixed(0)}`,
            resource_type: 'ot',
            resource_id:   ot.id,
            metadata:      { estimated, actual, pct, ot_number: ot.ot_number },
            is_read:       false,
          });
      } catch {
        // Silent fail — notif is best-effort
      }
    });
  }, [ots, user?.id, role]);
}
