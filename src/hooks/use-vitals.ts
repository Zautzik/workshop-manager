'use client';
import { useQuery } from '@tanstack/react-query';

export type FlowStatus = 'flowing' | 'stagnant' | 'clotted';

export interface Vital {
  value: number;
  unit?: string;
  series?: number[];
  status: FlowStatus;
  [k: string]: unknown;
}

export interface VitalsResponse {
  generatedAt: string;
  health: { score: number; label: string };
  vitals: {
    pulso: Vital;
    circulacion: Vital & { resolved: number; total: number };
    agni: Vital & { pending: number };
    carga: Vital & { running: number; total: number };
    reflejos: Vital;
    toxinas: Vital & { unmappedAssignments: number; orphanWorkstations: number; staleMachines: number };
    humano: Vital & { activeOperators: number };
  };
}

/** The organism's vital signs for the Living Home. */
export function useVitals() {
  return useQuery<VitalsResponse>({
    queryKey: ['vitals'],
    queryFn: async () => {
      const res = await fetch('/api/vitals', { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to fetch vitals: ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}
