'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const queryKeys = {
  adminStats: ['admin', 'stats'] as const,
  inventory: ['inventory'] as const,
  inventoryItems: ['inventory', 'items'] as const,
  inventoryLots: (itemId?: string | null) => ['inventory', 'lots', { itemId }] as const,
  inventoryTransactions: ['inventory', 'transactions'] as const,
  inventoryLowStockAlerts: ['inventory', 'lowStockAlerts'] as const,
  purchases: ['purchases'] as const,
};

interface AdminStats {
  totalUsers: number;
  totalWorkers: number;
  totalMachines: number;
  totalJobs: number;
}

export function useAdminStats() {
  return useQuery<AdminStats>({
    queryKey: queryKeys.adminStats,
    queryFn: async () => {
      const [usersData, workersData, machinesData, jobsData] = await Promise.all([
        supabase.from('user_roles').select('id', { count: 'exact', head: true }),
        supabase.from('employees').select('id', { count: 'exact', head: true }),
        supabase.from('machines').select('id', { count: 'exact', head: true }),
        supabase.from('jobs').select('id', { count: 'exact', head: true }),
      ]);
      return {
        totalUsers: usersData.count ?? 0,
        totalWorkers: workersData.count ?? 0,
        totalMachines: machinesData.count ?? 0,
        totalJobs: jobsData.count ?? 0,
      };
    },
    staleTime: 30_000,
  });
}

export function useInventory() {
  return useQuery<any[]>({
    queryKey: queryKeys.inventory,
    queryFn: async () => {
      const res = await fetch('/api/inventory/levels', { credentials: 'include' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'No se pudo cargar el inventario');
      return (body?.data ?? []) as any[];
    },
  });
}

export function useInventoryItems() {
  return useQuery<any[]>({
    queryKey: queryKeys.inventoryItems,
    queryFn: async () => {
      const res = await fetch('/api/inventory/levels', { credentials: 'include' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'No se pudo cargar el inventario');
      return (body?.data ?? []) as any[];
    },
  });
}

/**
 * Antes le preguntaba a la tabla directo desde el navegador. `inventory_lots`
 * exige `auth.uid() IS NOT NULL` por RLS — la ruta ya autenticada con rol de
 * servicio (`/api/inventory/lots`) siempre pudo leerla, así que esta pantalla
 * tenía DOS caminos hacia el mismo dato, y sólo uno funcionaba de manera
 * confiable. De paso se gana `libre` (el saldo con lo reservado descontado,
 * que `quantity_available` no distingue) y `material_kind` (auditoría 2026-08).
 */
export function useInventoryLots(itemId?: string | null) {
  return useQuery<any[]>({
    queryKey: queryKeys.inventoryLots(itemId),
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '500' });
      const res = await fetch(`/api/inventory/lots?${params}`, { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'No se pudieron cargar los lotes');
      }
      const body = await res.json();
      const all = (body.data ?? []) as any[];
      return itemId ? all.filter((l) => l.item_id === itemId) : all;
    },
  });
}

/**
 * Todo el libro de movimientos de inventario, sin fecha de corte.
 *
 * `InventoryManagement.tsx` recorta esto a una ventana de 30 días EN EL
 * NAVEGADOR para calcular consumo y rotación — así que un libro incompleto da
 * números incompletos sin avisar. Una consulta sin `.range()` queda expuesta
 * al tope por defecto de PostgREST (1000 filas), que en este mismo repo ya hizo
 * que un margen leyera 82% en vez de 22% (ver fetch-all.ts).
 *
 * El `fetchAll` que resolvía eso se movió a `/api/inventory/movements` junto
 * con la lectura: `inventory_stock_transactions_v` es una vista, y una vista
 * pasa por encima de RLS, así que leerla desde el navegador funcionaba y la
 * dejaba legible con la publishable key. La migración 20261014121000 le pone
 * `security_invoker` (auditoría 2026-10).
 *
 * La garantía se conserva de punta a punta: la ruta pagina hasta agotar la
 * tabla y devuelve `truncated`, y acá eso se convierte en error. Mostrar 30
 * días calculados sobre un libro recortado es el error que esto evita; seguir
 * bajando el libro entero para mirar 30 días sigue siendo el desperdicio que
 * era, y paginar la tabla que se muestra es un cambio de UI aparte.
 */
export function useInventoryTransactions() {
  return useQuery<any[]>({
    queryKey: queryKeys.inventoryTransactions,
    queryFn: async () => {
      // La paginación vive ahora en la ruta, con el mismo `fetchAll`.
      // `truncated` se propaga como error en vez de devolver un libro
      // incompleto en silencio — ver el encabezado de la ruta.
      const res = await fetch('/api/inventory/movements', { credentials: 'include' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'No se pudo leer el libro de movimientos');
      if (body?.truncated) {
        throw new Error(
          'El libro de movimientos superó el techo de paginación: los números de consumo y rotación saldrían incompletos.',
        );
      }
      return (body?.data ?? []) as any[];
    },
  });
}

export function useInventoryLowStockAlerts() {
  return useQuery<any[]>({
    queryKey: queryKeys.inventoryLowStockAlerts,
    queryFn: async () => {
      const res = await fetch('/api/inventory/low-stock', { credentials: 'include' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'No se pudieron cargar las alertas de stock');
      return (body?.data ?? []) as any[];
    },
  });
}

export function usePurchases() {
  return useQuery<{ data: any[]; truncated: boolean }>({
    queryKey: queryKeys.purchases,
    queryFn: async () => {
      // Server route (supabaseAdmin) — RLS blanks client-side reads under the
      // dev bypass, and this returns the oc_conciliacion roll-up (OC + OT +
      // el calce a tres bandas), paginated to exhaustion server-side.
      const res = await fetch('/api/purchases');
      if (!res.ok) throw new Error('Failed to fetch purchases');
      const json = await res.json();
      return { data: (json.data ?? []) as any[], truncated: !!json.truncated };
    },
  });
}
