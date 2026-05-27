/**
 * Single source of truth for the `machine_type` Postgres enum.
 * Mirrors Database['public']['Enums']['machine_type'] in
 *   src/integrations/supabase/types.ts
 */

export const MACHINE_TYPE_VALUES = [
	'offset_printer',
	'die_cutter',
	'guillotine',
	'digital_printer',
	'pre_press',
	'manual_workshop',
	'delivery',
] as const;

export type MachineType = (typeof MACHINE_TYPE_VALUES)[number];
