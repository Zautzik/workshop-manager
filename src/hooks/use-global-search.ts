'use client';

/**
 * useGlobalSearchResults — shared matching logic behind both search surfaces:
 * the inline navbar bar (desktop) and the dialog (mobile).
 *
 * The three lists come from React Query with a 60s staleTime and are already
 * warm from the module pages, so filtering stays a synchronous useMemo — no
 * debounce needed.
 */

import { useMemo } from 'react';
import { FileText, Users, Wrench } from 'lucide-react';
import { useOTs, useWorkers, useMachines } from '@/hooks/use-operations-queries';

/**
 * Matches Tailwind's `md` breakpoint — the width at which the desktop header
 * (and its inline search bar) takes over from the mobile header and its dialog.
 * Both surfaces stay mounted at every width, so the Cmd+K handlers use this to
 * decide which one owns the shortcut.
 */
export const DESKTOP_MEDIA_QUERY = '(min-width: 768px)';

export type ResultItem = {
  id: string;
  label: string;
  sublabel?: string;
  type: 'ot' | 'worker' | 'machine';
  href: string;
};

export const TYPE_META = {
  ot:      { label: 'OT',        icon: FileText, color: 'text-blue-500'   },
  worker:  { label: 'Empleado',  icon: Users,    color: 'text-amber-500'  },
  machine: { label: 'Equipo',    icon: Wrench,   color: 'text-orange-500' },
};

export function normalize(s: string) {
  return s?.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '') ?? '';
}

export function useGlobalSearchResults(query: string): ResultItem[] {
  const { data: otsRaw  = [] } = useOTs();
  const { data: workers = [] } = useWorkers();
  const { data: machines = [] } = useMachines();

  return useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];

    const items: ResultItem[] = [];

    // OTs — there is no OT detail route yet, so this lands on the board. The
    // ?ot= param is inert today; it carries the id for a future deep link.
    (otsRaw as any[]).forEach(ot => {
      if (
        normalize(ot.ot_number ?? '').includes(q) ||
        normalize(ot.client_name ?? '').includes(q) ||
        normalize(ot.status ?? '').includes(q)
      ) {
        items.push({
          id: `ot-${ot.id}`,
          label: ot.ot_number ?? ot.id,
          sublabel: ot.client_name,
          type: 'ot',
          href: `/operaciones/kanban?ot=${ot.id}`,
        });
      }
    });

    // Workers
    (workers as any[]).forEach(w => {
      if (normalize(w.full_name ?? w.name ?? '').includes(q)) {
        items.push({
          id: `worker-${w.id}`,
          label: w.full_name ?? w.name,
          sublabel: w.department,
          type: 'worker',
          href: `/personas/empleados`,
        });
      }
    });

    // Machines
    (machines as any[]).forEach(m => {
      if (normalize(m.name ?? '').includes(q) || normalize(m.brand ?? '').includes(q)) {
        items.push({
          id: `machine-${m.id}`,
          label: m.name,
          sublabel: m.brand,
          type: 'machine',
          href: `/equipos/maquinas`,
        });
      }
    });

    return items.slice(0, 8);
  }, [query, otsRaw, workers, machines]);
}
