import { formatCLP } from '@/lib/format';

export const CONTRACT_LABEL: Record<string, string> = {
  full_time: 'Tiempo Completo',
  part_time: 'Medio Tiempo',
  contractor: 'Contratista',
  temporary: 'Temporal',
  intern: 'Pasante',
};

/**
 * The app operates in one currency: Chilean pesos, shown as whole pesos.
 * Fractions still exist inside the costing calculations — they just never
 * reach the screen, because nobody quotes a job in centavos.
 */
export function formatMoney(amount: number) {
  return formatCLP(amount);
}

export interface MergedPerson {
  id: string;
  full_name: string;
  employee_code: string | null;
  department: string | null;
  status: string;
  hire_date: string | null;
  contract: any | null;
  comp: any | null;
  rating: number;
  quality: number;
  speed: number;
  attendance: number;
  teamwork: number;
  skills: any[];
  top: { name: string; level: number } | null;
  email: string | null;
  phone: string | null;
}

export interface TodayAssignment {
  station: string | null;
  stationId: string | null;
  type: string | null;
  otNumber: string | null;
  extra: number; // additional assignments beyond the first, same day
}
