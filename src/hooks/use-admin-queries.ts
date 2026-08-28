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
      const { data, error } = await supabase.from('inventory_items_stock_v').select('*').order('name');
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useInventoryItems() {
  return useQuery<any[]>({
    queryKey: queryKeys.inventoryItems,
    queryFn: async () => {
      const { data, error } = await supabase.from('inventory_items_stock_v').select('*').order('name');
      if (error) throw error;
      return (data ?? []) as any[];
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

export function useInventoryTransactions() {
  return useQuery<any[]>({
    queryKey: queryKeys.inventoryTransactions,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_stock_transactions_v')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useInventoryLowStockAlerts() {
  return useQuery<any[]>({
    queryKey: queryKeys.inventoryLowStockAlerts,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_low_stock_alerts_v' as any)
        .select('*')
        .order('shortage', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function usePurchases() {
  return useQuery<any[]>({
    queryKey: queryKeys.purchases,
    queryFn: async () => {
      // Server route (supabaseAdmin) — RLS blanks client-side reads under the
      // dev bypass, and this returns the oc_billing roll-up (OC + OT + variance).
      const res = await fetch('/api/purchases');
      if (!res.ok) throw new Error('Failed to fetch purchases');
      const json = await res.json();
      return (json.data ?? []) as any[];
    },
  });
}
