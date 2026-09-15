'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface ReconciliationAlert {
  lot_id: string;
  item_id: string;
  lot_number: string | null;
  item_name: string | null;
  item_sku: string | null;
  quantity_available: number;
  quantity_ledger: number;
  drift: number;
  detected_at: string;
}

/** Lotes donde el saldo guardado no coincide con la suma del libro de movimientos. */
export function useInventoryReconciliation() {
  return useQuery<{ alerts: ReconciliationAlert[]; count: number }>({
    queryKey: ['inventory', 'reconciliation'],
    queryFn: async () => {
      const res = await fetch('/api/inventory/reconciliation');
      if (!res.ok) throw new Error('Failed to fetch reconciliation alerts');
      return res.json();
    },
    staleTime: 120_000,
  });
}

/** Corre el chequeo ahora — para cuando pg_cron no está agendado en este plan. */
export function useRunInventoryReconciliation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/inventory/reconciliation', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? 'No se pudo reconciliar');
      return json;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'reconciliation'] }),
  });
}
