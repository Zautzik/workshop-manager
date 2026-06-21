'use client';
import { useQuery } from '@tanstack/react-query';

export interface RecallLot {
  id: string;
  lot_number: string;
  supplier_name: string | null;
  certification_code: string | null;
  certification_expires_on: string | null;
  quantity_available: number | null;
  received_date: string | null;
  item: { name: string | null; sku: string | null } | null;
}

export interface RecallTrace {
  lot: {
    id: string;
    lot_number: string;
    supplier_name: string | null;
    certification_code: string | null;
    certification_expires_on: string | null;
    received_date: string | null;
    item: { name: string | null; sku: string | null } | null;
  };
  affected_ots: Array<{
    id: string;
    ot_number: string | null;
    client_name: string | null;
    status: string | null;
    created_at: string | null;
    quantity: number | null;
    consumed_quantity: number;
  }>;
  customers: string[];
  summary: { ot_count: number; customer_count: number; total_consumed: number };
}

/** All material lots, for the recall picker. */
export function useRecallLots() {
  return useQuery<{ lots: RecallLot[] }>({
    queryKey: ['recall-lots'],
    queryFn: async () => {
      const res = await fetch('/api/recall', { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to list lots: ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });
}

/** Forward-trace one lot → affected OTs + customers (mock recall). */
export function useRecall(lotId: string | null) {
  return useQuery<RecallTrace>({
    queryKey: ['recall', lotId],
    enabled: !!lotId,
    queryFn: async () => {
      const res = await fetch(`/api/recall?lot_id=${lotId}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to trace lot: ${res.status}`);
      return res.json();
    },
  });
}
