'use client';

/**
 * useGlobalSearchResults — the matching logic behind the top bar's search field.
 *
 * OTs, workers and machines come from React Query with a 60s staleTime and
 * are already warm from the module pages, so that part stays a synchronous
 * useMemo — no debounce needed.
 *
 * Clients and inventory items are NOT in any client-side cache — the only
 * place that can answer "does a client/item match this text" is the server,
 * via /api/search/advanced (built for this, but until now never called from
 * anywhere). That route is gated to `admin/supervisor/manager/hr_manager`
 * (clients and inventory carry contact/cost data `technician`/`vendedor`
 * aren't shown elsewhere in the app), so the extra domains only light up for
 * those roles — everyone else keeps exactly today's ot/worker/machine
 * behaviour. Being an actual network call, it's debounced.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Users, Wrench, Building2, Package } from 'lucide-react';
import { useOTs, useWorkers, useMachines } from '@/hooks/use-operations-queries';
import { useAuth } from '@/contexts/AuthContext';
import type { AppRole } from '@/types/app-role';

export type ResultItem = {
  id: string;
  label: string;
  sublabel?: string;
  type: 'ot' | 'worker' | 'machine' | 'client' | 'inventory';
  href: string;
};

export const TYPE_META = {
  ot:        { label: 'OT',       icon: FileText,  color: 'text-blue-500'   },
  worker:    { label: 'Empleado', icon: Users,     color: 'text-amber-500'  },
  machine:   { label: 'Equipo',   icon: Wrench,    color: 'text-orange-500' },
  client:    { label: 'Cliente',  icon: Building2, color: 'text-violet-500' },
  inventory: { label: 'Insumo',   icon: Package,   color: 'text-teal-500'   },
};

export function normalize(s: string) {
  return s?.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '') ?? '';
}

// Mirrors /api/search/advanced's own requireAuth() list — not a separate
// policy decision, just where this hook finds out whether that call is worth
// making at all.
const ADVANCED_SEARCH_ROLES: AppRole[] = ['admin', 'supervisor', 'manager', 'hr_manager'];

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function useGlobalSearchResults(query: string): ResultItem[] {
  const { data: otsRaw  = [] } = useOTs();
  const { data: workers = [] } = useWorkers();
  const { data: machines = [] } = useMachines();
  const { role } = useAuth();

  const trimmed = query.trim();
  const debouncedQuery = useDebounced(trimmed, 250);
  const canSearchAdvanced = role != null && ADVANCED_SEARCH_ROLES.includes(role);

  const { data: advanced } = useQuery({
    queryKey: ['global-search-advanced', debouncedQuery],
    queryFn: async () => {
      const params = new URLSearchParams({ q: debouncedQuery, domain: 'all', limit: '5' });
      const res = await fetch(`/api/search/advanced?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Advanced search failed: ${res.status}`);
      return res.json() as Promise<{ clients?: any[]; inventory?: any[] }>;
    },
    enabled: canSearchAdvanced && debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  return useMemo(() => {
    const q = normalize(trimmed);
    if (!q) return [];

    // A client with a dozen OTs open must not be able to push its own client
    // row (and every inventory row) off the bottom of the list — each domain
    // gets a fixed slice of the 8 slots instead of first-come-first-served.
    const ots: ResultItem[] = [];
    const workerItems: ResultItem[] = [];
    const machineItems: ResultItem[] = [];
    const clientItems: ResultItem[] = [];
    const inventoryItems: ResultItem[] = [];

    // OTs — there is no OT detail route yet, so this lands on the board. The
    // ?ot= param is inert today; it carries the id for a future deep link.
    for (const ot of otsRaw as any[]) {
      if (ots.length >= 3) break;
      if (
        normalize(ot.ot_number ?? '').includes(q) ||
        normalize(ot.client_name ?? '').includes(q) ||
        normalize(ot.status ?? '').includes(q)
      ) {
        ots.push({
          id: `ot-${ot.id}`,
          label: ot.ot_number ?? ot.id,
          sublabel: ot.client_name,
          type: 'ot',
          href: `/operaciones/kanban?ot=${ot.id}`,
        });
      }
    }

    // Workers
    for (const w of workers as any[]) {
      if (workerItems.length >= 2) break;
      if (normalize(w.full_name ?? w.name ?? '').includes(q)) {
        workerItems.push({
          id: `worker-${w.id}`,
          label: w.full_name ?? w.name,
          sublabel: w.department,
          type: 'worker',
          href: `/personas/empleados`,
        });
      }
    }

    // Machines
    for (const m of machines as any[]) {
      if (machineItems.length >= 1) break;
      if (normalize(m.name ?? '').includes(q) || normalize(m.brand ?? '').includes(q)) {
        machineItems.push({
          id: `machine-${m.id}`,
          label: m.name,
          sublabel: m.brand,
          type: 'machine',
          href: `/equipos/maquinas`,
        });
      }
    }

    // Clients and inventory — server-matched, so no re-filtering by `q` here;
    // /api/search/advanced already did it (and against columns, like `rut` or
    // `sku`, this hook has no local copy of to match against anyway).
    for (const c of advanced?.clients ?? []) {
      if (clientItems.length >= 1) break;
      clientItems.push({
        id: `client-${c.id}`,
        label: c.name,
        sublabel: c.contact_name || c.rut,
        type: 'client',
        href: `/comercial/clientes?client=${c.id}`,
      });
    }

    for (const i of advanced?.inventory ?? []) {
      if (inventoryItems.length >= 1) break;
      inventoryItems.push({
        id: `inventory-${i.id}`,
        label: i.name,
        sublabel: i.sku,
        type: 'inventory',
        href: `/operaciones/inventario?item=${i.id}`,
      });
    }

    return [...ots, ...workerItems, ...machineItems, ...clientItems, ...inventoryItems];
  }, [trimmed, otsRaw, workers, machines, advanced]);
}
