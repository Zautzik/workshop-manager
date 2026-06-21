'use client';
import { useQuery } from '@tanstack/react-query';

export type CertState = 'vigente' | 'por_vencer' | 'vencido' | 'faltante' | 'sin_vencimiento';

export interface CertLot {
  lot_id: string;
  lot_number: string;
  item_name: string | null;
  item_sku: string | null;
  supplier_name: string | null;
  certification_code: string | null;
  certification_expires_on: string | null;
  received_date: string | null;
  quantity_available: number;
  state: CertState;
}

export interface CertificationsResponse {
  summary: {
    total: number;
    vigente: number;
    por_vencer: number;
    vencido: number;
    faltante: number;
    sin_vencimiento: number;
    at_risk: number;
  };
  lots: CertLot[];
}

/** FSSC 22000 incoming-material certificate register. */
export function useCertifications() {
  return useQuery<CertificationsResponse>({
    queryKey: ['certifications'],
    queryFn: async () => {
      const res = await fetch('/api/certifications', { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to fetch certifications: ${res.status}`);
      return res.json();
    },
    staleTime: 120_000,
  });
}
