/**
 * Single source of truth for the `machine_usage_unit` Postgres enum.
 * Mirrors Database['public']['Enums']['machine_usage_unit'].
 *
 * Es lo que permite que la Ryobi se mantenga por impresiones y la Roland por
 * horas sin que ninguna de las dos tenga que convertir nada: la vida útil de un
 * repuesto, la frecuencia de una pauta y el ritmo de consumo viajan todos en
 * la unidad de SU máquina.
 */

export const MACHINE_USAGE_UNIT_VALUES = [
	'impressions',
	'hours',
	'kilometers',
	'cycles',
] as const;

export type MachineUsageUnit = (typeof MACHINE_USAGE_UNIT_VALUES)[number];

export const USAGE_UNIT_LABEL: Record<MachineUsageUnit, string> = {
	impressions: 'Impresiones',
	hours: 'Horas',
	kilometers: 'Kilómetros',
	cycles: 'Ciclos',
};

/** Cómo se nombra la unidad dentro de una frase. */
export const USAGE_UNIT_INLINE: Record<MachineUsageUnit, string> = {
	impressions: 'impresiones',
	hours: 'horas',
	kilometers: 'km',
	cycles: 'ciclos',
};

export const USAGE_UNIT_SHORT: Record<MachineUsageUnit, string> = {
	impressions: 'impr.',
	hours: 'h',
	kilometers: 'km',
	cycles: 'ciclos',
};

/** Qué unidad corresponde por defecto a cada clase de máquina. */
export const DEFAULT_USAGE_UNIT: Record<string, MachineUsageUnit> = {
	offset_printer: 'impressions',
	digital_printer: 'impressions',
	delivery: 'kilometers',
};

export function defaultUsageUnitFor(machineType: string): MachineUsageUnit {
	return DEFAULT_USAGE_UNIT[machineType] ?? 'hours';
}

export function usageUnitInline(unit: string): string {
	return USAGE_UNIT_INLINE[unit as MachineUsageUnit] ?? unit;
}

export function usageUnitShort(unit: string): string {
	return USAGE_UNIT_SHORT[unit as MachineUsageUnit] ?? unit;
}
