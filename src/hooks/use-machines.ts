'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MachineType =
  | 'offset_printer'
  | 'die_cutter'
  | 'guillotine'
  | 'digital_printer'
  | 'pre_press'
  | 'manual_workshop'
  | 'delivery';

export type MachineStatus = 'idle' | 'running' | 'maintenance' | 'offline' | 'setup' | 'breakdown';

export interface Machine {
  id: string;
  name: string;
  type: MachineType;
  status: MachineStatus;
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  year_manufactured?: number | null;
  location?: string | null;
  description?: string | null;
  photo_url?: string | null;
  nominal_speed_sheets_hr?: number | null;
  optimal_speed_sheets_hr?: number | null;
  max_print_width_mm?: number | null;
  max_print_height_mm?: number | null;
  colors?: number | null;
  power_kw?: number | null;
  energy_cost_per_hr?: number | null;
  maintenance_cost_monthly?: number | null;
  depreciation_monthly?: number | null;
  is_active: boolean;
  workstation_id?: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  workstations?: { id: string; name: string } | null;
  machine_supply_requirements?: MachineSupplyRequirement[];
}

export interface MachineSupplyRequirement {
  id: string;
  machine_id: string;
  inventory_item_id: string;
  consumption_rate: number;
  rate_unit: string;
  notes?: string | null;
  is_critical: boolean;
  created_at: string;
  updated_at: string;
  // Relations
  inventory_items?: { id: string; name: string; unit: string; category: string } | null;
}

export interface MachineCostEntry {
  id: string;
  machine_id: string;
  period_month: string;
  energy_kwh?: number | null;
  energy_cost?: number | null;
  maintenance_cost?: number | null;
  supplies_cost?: number | null;
  other_cost?: number | null;
  notes?: string | null;
  created_at: string;
}

export type MachineUpsert = Omit<Machine,
  'id' | 'created_at' | 'updated_at' | 'workstations' | 'machine_supply_requirements'
> & { id?: string };

// ─── Query Keys ───────────────────────────────────────────────────────────────

const Q = {
  all:        ['machines'] as const,
  list:       ['machines', 'list'] as const,
  detail:     (id: string) => ['machines', 'detail', id] as const,
  supplies:   (machineId: string) => ['machines', 'supplies', machineId] as const,
  costs:      (machineId: string) => ['machines', 'costs', machineId] as const,
  planta:     ['planta', 'live'] as const,
};

const LEGACY_MACHINE_NAME_ALIASES: Record<string, string> = {
  'offset printer 1': 'ryobi offset 524gs #1',
  'offset printer 2': 'ryobi offset 524gs #2',
  'offset printer 3': 'roland offset #1',
  'die cutter': 'die cutter #1',
  'die cutter 1': 'die cutter #1',
  'guillotine 1': 'guillotine #1',
  'guillotine 2': 'guillotine #2',
  'guillotine 3': 'guillotine #3',
  'delivery station': 'dispatch vehicle #1',
};

function canonicalMachineName(name: string) {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return LEGACY_MACHINE_NAME_ALIASES[normalized] ?? normalized;
}

function machineQualityScore(machine: Machine) {
  return (
    (machine.is_active ? 20 : 0) +
    (machine.workstation_id ? 10 : 0) +
    (machine.brand ? 4 : 0) +
    (machine.model ? 4 : 0) +
    (machine.location ? 2 : 0)
  );
}

function dedupeMachines(machines: Machine[]) {
  const winners = new Map<string, Machine>();

  for (const machine of machines) {
    const key = canonicalMachineName(machine.name);
    const current = winners.get(key);
    if (!current) {
      winners.set(key, machine);
      continue;
    }

    const currentScore = machineQualityScore(current);
    const nextScore = machineQualityScore(machine);
    const currentUpdated = Date.parse(current.updated_at || current.created_at || '1970-01-01');
    const nextUpdated = Date.parse(machine.updated_at || machine.created_at || '1970-01-01');

    if (nextScore > currentScore || (nextScore === currentScore && nextUpdated > currentUpdated)) {
      winners.set(key, machine);
    }
  }

  return [...winners.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/** All machines with basic workstation join */
export function useMachines(activeOnly = false) {
  return useQuery<Machine[]>({
    queryKey: [...Q.list, { activeOnly }],
    queryFn: async () => {
      let q = supabase
        .from('machines')
        .select('*')
        .order('name');
      if (activeOnly) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return dedupeMachines((data ?? []) as Machine[]);
    },
  });
}

/** Single machine with full details */
export function useMachine(id: string | undefined | null) {
  return useQuery<Machine | null>({
    queryKey: Q.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('machines')
        .select('*, machine_supply_requirements(*, inventory_items(id, name, unit, category))')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data as Machine | null;
    },
  });
}

/** Supply requirements for a machine */
export function useMachineSupplies(machineId: string | undefined | null) {
  return useQuery<MachineSupplyRequirement[]>({
    queryKey: Q.supplies(machineId ?? ''),
    enabled: Boolean(machineId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('machine_supply_requirements')
        .select('*, inventory_items(id, name, unit, category)')
        .eq('machine_id', machineId!)
        .order('is_critical', { ascending: false });
      if (error) throw error;
      return (data ?? []) as MachineSupplyRequirement[];
    },
  });
}

/** Cost history for a machine */
export function useMachineCosts(machineId: string | undefined | null) {
  return useQuery<MachineCostEntry[]>({
    queryKey: Q.costs(machineId ?? ''),
    enabled: Boolean(machineId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('machine_cost_entries')
        .select('*')
        .eq('machine_id', machineId!)
        .order('period_month', { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []) as MachineCostEntry[];
    },
  });
}

/** Planta live view – workstations enriched with machine + OT + workers + supply alerts */
export function usePlantaLive() {
  return useQuery<any[]>({
    queryKey: Q.planta,
    queryFn: async () => {
      const { data, error } = await supabase.from('planta_live').select('*');
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000, // auto-refresh every 30 seconds
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useUpsertMachine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (machine: MachineUpsert) => {
      const { id, ...rest } = machine;
      if (id) {
        const { data, error } = await supabase
          .from('machines')
          .update({ ...rest, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('machines')
          .insert(rest)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: Q.all });
      qc.invalidateQueries({ queryKey: Q.planta });
    },
  });
}

export function useDeleteMachine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/machines/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        let message = 'Failed to delete machine';
        try {
          const body = await response.json();
          if (body?.error) message = body.error;
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(message);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: Q.all });
      qc.invalidateQueries({ queryKey: Q.planta });
    },
  });
}

export function useUpdateMachineStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: MachineStatus }) => {
      const { error } = await supabase
        .from('machines')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: Q.all });
      qc.invalidateQueries({ queryKey: Q.planta });
    },
  });
}

export function useUpsertMachineSupply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (supply: Omit<MachineSupplyRequirement, 'id' | 'created_at' | 'updated_at' | 'inventory_items'> & { id?: string }) => {
      const { id, ...rest } = supply;
      if (id) {
        const { data, error } = await supabase
          .from('machine_supply_requirements')
          .update({ ...rest, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('machine_supply_requirements')
          .insert(rest)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: Q.supplies(vars.machine_id) });
      qc.invalidateQueries({ queryKey: Q.planta });
    },
  });
}

export function useDeleteMachineSupply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, machineId }: { id: string; machineId: string }) => {
      const { error } = await supabase
        .from('machine_supply_requirements')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return machineId;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: Q.supplies(vars.machineId) });
    },
  });
}

export function useUpsertMachineCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: Omit<MachineCostEntry, 'id' | 'created_at'> & { id?: string }) => {
      const { id, ...rest } = entry;
      if (id) {
        const { data, error } = await supabase.from('machine_cost_entries').update(rest).eq('id', id).select().single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase.from('machine_cost_entries').insert(rest).select().single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: Q.costs(vars.machine_id) });
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const MACHINE_TYPE_LABELS: Record<MachineType, string> = {
  offset_printer:   'Offset / Prensa',
  die_cutter:       'Troqueladota',
  guillotine:       'Guillotina',
  digital_printer:  'Digital / Inkjet',
  pre_press:        'Pre-prensa',
  manual_workshop:  'Taller Manual',
  delivery:         'Despacho',
};

export const MACHINE_STATUS_LABELS: Record<MachineStatus, string> = {
  idle:        'En espera',
  running:     'En operación',
  maintenance: 'En mantenimiento',
  offline:     'Fuera de servicio',
  setup:       'En preparación',
  breakdown:   'Avería',
};

export const MACHINE_STATUS_COLOR: Record<MachineStatus, string> = {
  idle:        'bg-slate-400',
  running:     'bg-emerald-500',
  maintenance: 'bg-amber-500',
  offline:     'bg-red-500',
  setup:       'bg-blue-400',
  breakdown:   'bg-rose-600',
};
