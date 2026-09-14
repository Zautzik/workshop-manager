'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const isDevBypass =
  process.env.NODE_ENV === 'development' &&
  process.env.NEXT_PUBLIC_DEV_BYPASS === 'true';

const devMachine = { id: 'dev-machine-1', name: 'Ryobi 524GS', type: 'offset_printer' };

const devChecklists: any[] = [
  {
    id: 'dev-checklist-1',
    name: 'PM semanal Ryobi 524GS',
    frequency: 'weekly',
    machine_type: 'offset_printer',
    items: ['Lubricar puntos criticos', 'Revisar rodillos', 'Limpiar sensores'],
    machines: { name: devMachine.name },
    created_at: '2026-06-01T08:00:00.000Z',
  },
  {
    id: 'dev-checklist-2',
    name: 'PM mensual Guillotina',
    frequency: 'monthly',
    machine_type: 'guillotine',
    items: ['Calibrar tope', 'Revisar cuchilla', 'Verificar seguridad'],
    machines: { name: 'Guillotina Industrial' },
    created_at: '2026-06-02T08:00:00.000Z',
  },
];

const devWorkOrders: any[] = [
  {
    id: 'dev-wo-1',
    machine_id: devMachine.id,
    checklist_id: 'dev-checklist-1',
    scheduled_date: new Date().toISOString(),
    status: 'pending',
    machines: { name: devMachine.name, type: devMachine.type },
    maintenance_checklists: devChecklists[0],
  },
  {
    id: 'dev-wo-2',
    machine_id: 'dev-machine-2',
    checklist_id: 'dev-checklist-2',
    scheduled_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: 'in_progress',
    machines: { name: 'Guillotina Industrial', type: 'guillotine' },
    maintenance_checklists: devChecklists[1],
  },
  {
    id: 'dev-wo-3',
    machine_id: devMachine.id,
    checklist_id: 'dev-checklist-1',
    scheduled_date: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    status: 'completed',
    machines: { name: devMachine.name, type: devMachine.type },
    maintenance_checklists: devChecklists[0],
  },
];

const queryKeys = {
  checklists: ['maintenance', 'checklists'] as const,
  workOrders: ['maintenance', 'workOrders'] as const,
  workOrdersByStatus: (statuses?: string[]) => ['maintenance', 'workOrders', { statuses }] as const,
  schedules: (machineId?: string | null) => ['maintenance', 'schedules', { machineId }] as const,
};

export interface MaintenanceScheduleRow {
  id: string;
  machine_id: string;
  system_id: string | null;
  checklist_id: string | null;
  checklist_name: string | null;
  /** daily/weekly/monthly/... del checklist enlazado -- ver frequencyLabel en maintenance-checklist-meta.ts. Null si la pauta no tiene checklist todavía. */
  checklist_frequency: string | null;
  machine_name: string | null;
  maintenance_type: string;
  description: string | null;
  frequency_days: number | null;
  frequency_usage: number | null;
  estimated_duration_hours: number | null;
  usage_unit: string;
  machine_systems: { id: string; code: string; name: string } | null;
  due: import('@/lib/maintenance-due').DueResult;
}

/**
 * Vía la ruta, no el cliente de Supabase directo: bajo dev-bypass no hay JWT,
 * así que un fetch directo devolvería vacío en vez de las 12 pautas reales
 * -- mismo motivo que useWorkers() en use-workflow-queries.ts. Una sola
 * queryKey acá, compartida por Vencimientos y Pautas, para no repetir el
 * mismo bug de colisión-por-casualidad que ya rompió el Kanban dos veces
 * este mes (ver el comentario en useOTs, use-workflow-queries.ts).
 */
export function useMaintenanceSchedules(machineId?: string | null) {
  return useQuery<{ schedules: MaintenanceScheduleRow[]; summary: Record<string, number> }>({
    queryKey: queryKeys.schedules(machineId),
    queryFn: async () => {
      const params = machineId ? `?machine_id=${encodeURIComponent(machineId)}` : '';
      const res = await fetch(`/api/maintenance/schedules${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('No se pudieron cargar las pautas');
      return res.json();
    },
  });
}

/**
 * Crea la orden que le falta a una pauta vencida -- extraída de
 * VencimientosPanel.tsx (mismo botón "Crear orden") para que
 * MachinePendingMaintenance.tsx (pantalla móvil, escaneada por QR) ofrezca
 * la misma acción sin reimplementar el POST.
 */
export function useCreateOrderFromSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (schedule: MaintenanceScheduleRow) => {
      const res = await fetch('/api/maintenance/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          machine_id: schedule.machine_id,
          work_order_type: 'preventivo',
          checklist_id: schedule.checklist_id,
          schedule_id: schedule.id,
          system_id: schedule.system_id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo crear la orden');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance', 'schedules'] });
      queryClient.invalidateQueries({ queryKey: ['maintenance', 'workOrders'] });
    },
  });
}

/**
 * Vía la ruta, no el cliente de Supabase directo -- mismo motivo que
 * useWorkers()/useMaintenanceSchedules(): bajo dev-bypass no hay JWT, así que
 * un fetch directo devolvía las 2 checklists de muestra en vez de las reales.
 * El editor (MaintenanceChecklistEditor) ya escribe por esta misma ruta; esto
 * sólo hace que la lectura use el mismo camino.
 */
export function useMaintenanceChecklists() {
  return useQuery({
    queryKey: queryKeys.checklists,
    queryFn: async () => {
      const res = await fetch('/api/maintenance/checklists', { credentials: 'include' });
      if (!res.ok) throw new Error('No se pudieron cargar las checklists');
      return res.json();
    },
  });
}

/**
 * Vía /api/maintenance/work-orders (sin `open`/`status`, trae todo con el
 * detalle completo -- ver el branch de `selectFields` en esa ruta), no el
 * cliente de Supabase directo -- mismo motivo que useWorkers()/
 * useMaintenanceChecklists(): bajo dev-bypass no hay JWT, y el fetch directo
 * devolvía las 3 órdenes de muestra en vez de las reales.
 */
export function useMaintenanceWorkOrders() {
  return useQuery<any[]>({
    queryKey: queryKeys.workOrders,
    queryFn: async () => {
      const res = await fetch('/api/maintenance/work-orders', { credentials: 'include' });
      if (!res.ok) throw new Error('No se pudieron cargar las órdenes de trabajo');
      const body = await res.json();
      return body.orders ?? [];
    },
  });
}

export function useMaintenanceWorkOrdersByStatus(statuses: string[]) {
  return useQuery<any[]>({
    queryKey: queryKeys.workOrdersByStatus(statuses),
    queryFn: async () => {
      const res = await fetch(`/api/maintenance/work-orders?status=${statuses.map(encodeURIComponent).join(',')}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('No se pudieron cargar las órdenes de trabajo');
      const body = await res.json();
      return body.orders ?? [];
    },
  });
}

export function useMaintenanceStats() {
  return useQuery({
    queryKey: [...queryKeys.workOrders, 'stats'],
    queryFn: async () => {
      if (isDevBypass) {
        const rows = devWorkOrders;
        return {
          pending: rows.filter((row) => row.status === 'pending').length,
          in_progress: rows.filter((row) => row.status === 'in_progress').length,
          completed: rows.filter((row) => row.status === 'completed').length,
          total: rows.length,
        };
      }

      const { data, error } = await supabase.from('maintenance_work_orders').select('status');
      if (error) throw error;
      const rows = data ?? [];
      return {
        pending: rows.filter((row) => row.status === 'pending').length,
        in_progress: rows.filter((row) => row.status === 'in_progress').length,
        completed: rows.filter((row) => row.status === 'completed').length,
        total: rows.length,
      };
    },
    staleTime: 30_000,
  });
}

/**
 * Which workstations are out of service right now because their machine has an
 * open maintenance order. Planta reads this so a press being serviced cannot be
 * handed operators — in a real shop that is law, but the two modules used to
 * live back to back.
 */
export interface MaintenanceBlock {
  work_order_id: string;
  status: string;
  machine_name: string | null;
  workstation_name?: string;
  started_at: string | null;
}

export function useStationsUnderMaintenance() {
  return useQuery<Record<string, MaintenanceBlock>>({
    queryKey: ['maintenance', 'stations-blocked'],
    queryFn: async () => {
      const res = await fetch('/api/maintenance/work-orders?open=1', {
        credentials: 'include',
      });
      // Era `if (!res.ok) return {}` — un 401 (sesión vencida a mitad de
      // turno) se leía exactamente igual que "ninguna estación bloqueada":
      // toda prensa, incluida una abierta para mantención, quedaba
      // disponible para asignar. Se lanza para que quien consuma esto pueda
      // fallar CERRADO —tratar "no sé" distinto de "está libre"— en vez de
      // heredar en silencio el mismo defecto (auditoría 2026-08).
      if (!res.ok) throw new Error(`No se pudo verificar mantención (HTTP ${res.status})`);
      const payload = await res.json().catch(() => null);
      return (payload?.by_workstation ?? {}) as Record<string, MaintenanceBlock>;
    },
    staleTime: 60 * 1000,
  });
}
