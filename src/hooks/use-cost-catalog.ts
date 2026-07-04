'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CostCenterItem } from '@/types/work-category';

const KEY = ['cost-catalog'] as const;

export function useCostCatalog() {
  return useQuery<CostCenterItem[]>({
    queryKey: KEY,
    queryFn: async () => {
      const res = await fetch('/api/cost-catalog');
      if (!res.ok) throw new Error('Failed to fetch cost catalog');
      return (await res.json()).data ?? [];
    },
  });
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? 'Request failed');
  return json.data ?? json;
}

/** Create (no id) or update (id present) a catalog line. */
export function useSaveCostItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: Partial<CostCenterItem> & { id?: string }) => {
      const payload = {
        name: item.name, category: item.category, unit: item.unit,
        unit_cost: item.unit_cost, is_active: item.is_active, notes: item.notes ?? null,
      };
      return item.id
        ? send(`/api/cost-catalog/${item.id}`, 'PATCH', payload)
        : send('/api/cost-catalog', 'POST', payload);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteCostItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => send(`/api/cost-catalog/${id}`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useToggleCostItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      send(`/api/cost-catalog/${id}`, 'PATCH', { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export interface MaterialCost {
  item_id: string;
  sku: string;
  name: string;
  unit: string;
  category: string;
  estimated_unit_cost: number;
  weighted_cost: number;
  lot_count: number;
  total_received: number;
  latest_cost: number | null;
  latest_received: string | null;
}

/** Per-SKU catalog estimate vs purchase-weighted real cost (material_cost_v). */
export function useMaterialCost() {
  return useQuery<MaterialCost[]>({
    queryKey: ['material-cost'],
    queryFn: async () => {
      const res = await fetch('/api/inventory/material-cost');
      if (!res.ok) throw new Error('Failed to fetch material cost');
      return (await res.json()).data ?? [];
    },
  });
}
