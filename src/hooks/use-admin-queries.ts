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

export function useInventoryLots(itemId?: string | null) {
  return useQuery<any[]>({
    queryKey: queryKeys.inventoryLots(itemId),
    queryFn: async () => {
      let query = supabase
        .from('inventory_lots')
        .select('*, inventory_items(name, sku, category, unit)')
        .order('received_date', { ascending: false });

      if (itemId) {
        query = query.eq('item_id', itemId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as any[];
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
      const { data, error } = await supabase
        .from('purchases' as any)
        .select('*')
        .order('purchase_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}
