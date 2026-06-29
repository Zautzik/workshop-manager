'use client';
import { useQuery } from '@tanstack/react-query';

export interface VistoBueno {
  id: string;
  vb_number: string;
  client_id: string | null;
  client_name: string | null;
  salesman_id: string | null;
  product_name: string | null;
  quantity: number | null;
  estimate_lines: any;
  subtotal_cost: number;
  margin_pct: number;
  markup_pct: number;
  total_price: number;
  unit_price: number;
  floor_price: number;
  status: 'draft' | 'sent' | 'signed' | 'converted' | 'rejected' | 'expired';
  ot_id: string | null;
  created_at: string;
}

/** All Vistos Buenos (quotes). vendedor scoping is applied server-side. */
export function useVistosBuenos() {
  return useQuery<VistoBueno[]>({
    queryKey: ['vistosBuenos'],
    queryFn: async () => {
      const res = await fetch('/api/vistos-buenos', { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to fetch vistos buenos: ${res.status}`);
      const payload = await res.json();
      return (payload?.data ?? []) as VistoBueno[];
    },
  });
}
