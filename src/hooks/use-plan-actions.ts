'use client';

/**
 * The writes of the production plan — shared by the Gantt (drag) and the phone
 * stage panel (buttons). Pinning, releasing and correcting make-ready all go
 * through the same routes, with the same cache refresh, from either screen.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/hooks/use-workflow-queries';
import { PLAN_STEP_BY_KEY } from '@/lib/production-route';
import { formatPlantDateTime } from '@/lib/production-plan';
import type { Block, Lane } from '@/lib/production-scheduler';

export function usePlanActions() {
  const queryClient = useQueryClient();

  const refresh = useCallback(
    (touchesOts: boolean) => {
      queryClient.invalidateQueries({ queryKey: ['planificacion'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
      if (touchesOts) queryClient.invalidateQueries({ queryKey: queryKeys.ots });
    },
    [queryClient],
  );

  /**
   * Fix a stage on a machine and time (a pin in `ot_machine_schedule`). The
   * route also sets the OT's assigned machine when it was empty
   * (syncAssignedMachine). Returns true when saved.
   */
  const pin = useCallback(
    async (block: Block, lane: Lane, start: number, end: number, otLabel = ''): Promise<boolean> => {
      if (!lane.machineId || lane.virtual) {
        toast.error('Esa etapa no se puede hacer en esa máquina');
        return false;
      }
      const body = {
        machine_id: lane.machineId,
        scheduled_start: new Date(start).toISOString(),
        scheduled_end: new Date(end).toISOString(),
        plan_step: block.step,
      };
      const res = block.slotId
        ? await fetch(`/api/ot-schedule/${block.slotId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch('/api/ot-schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, ot_id: block.otId, estimated_hours: block.estimatedHours }),
          });
      if (!res.ok) {
        toast.error('No se pudo fijar el bloque', { description: `El servidor respondió ${res.status}.` });
        return false;
      }
      toast.success(`${otLabel ? `${otLabel} · ` : ''}${PLAN_STEP_BY_KEY[block.step].label} fijada en ${lane.name}, ${formatPlantDateTime(start)}`);
      refresh(block.step === 'offset' || block.step === 'digital');
      return true;
    },
    [refresh],
  );

  /** Remove a pin: the stage goes back to being placed by the scheduler. */
  const release = useCallback(
    async (block: Block): Promise<boolean> => {
      if (!block.slotId) return false;
      const res = await fetch(`/api/ot-schedule/${block.slotId}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('No se pudo liberar el bloque');
        return false;
      }
      toast.success(`${PLAN_STEP_BY_KEY[block.step].label} vuelve a programarse sola`);
      refresh(false);
      return true;
    },
    [refresh],
  );

  /** The OT's own make-ready per pass (`ots.ajuste_minutes`); null = the press's. */
  const saveAjuste = useCallback(
    async (otId: string, minutes: number | null): Promise<boolean> => {
      const res = await fetch(`/api/ots/${otId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ajuste_minutes: minutes }),
      });
      if (!res.ok) {
        toast.error('No se pudo guardar el ajuste', { description: `El servidor respondió ${res.status}.` });
        return false;
      }
      toast.success(minutes == null ? 'Ajuste vuelve al de la prensa' : `Ajuste de este trabajo: ${minutes} min por pasada`);
      refresh(true);
      return true;
    },
    [refresh],
  );

  return { pin, release, saveAjuste };
}
