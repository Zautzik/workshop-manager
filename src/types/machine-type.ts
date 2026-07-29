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
	// Terminación. Antes caían todas en 'manual_workshop', que es donde iba lo
	// que el modelo no sabía nombrar: sin tipo propio no podían tener sistemas,
	// pauta ni repuestos (auditoría 2026-07).
	'folder',         // dobladora
	'collator',       // alzadora
	'stitcher',       // corchetera
	'perfect_binder', // hotmelera
	'laminator',      // polilaminadora
] as const;

export type MachineType = (typeof MACHINE_TYPE_VALUES)[number];

/**
 * Nombres en el idioma del taller, no del esquema. Vive junto al enum para que
 * agregar una máquina obligue a nombrarla en la misma edición.
 */
export const MACHINE_TYPE_LABEL: Record<MachineType, string> = {
	offset_printer: 'Offset / Prensa',
	die_cutter: 'Troqueladora',
	guillotine: 'Guillotina',
	digital_printer: 'Digital / Inkjet',
	pre_press: 'Pre-prensa',
	manual_workshop: 'Taller Manual',
	delivery: 'Despacho',
	folder: 'Dobladora',
	collator: 'Alzadora',
	stitcher: 'Corchetera',
	perfect_binder: 'Hotmelera',
	laminator: 'Polilaminadora',
};

/** Para valores que llegan como string suelto desde la API. */
export function machineTypeLabel(type: string): string {
	return MACHINE_TYPE_LABEL[type as MachineType] ?? type;
}
