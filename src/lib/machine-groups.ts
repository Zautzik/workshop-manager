/**
 * Agrupar la flota por tipo de máquina, con encabezados en el idioma del taller.
 *
 * Existía ya un mapa de estos nombres dentro de WorkstationLayout, en singular y
 * sólo con 7 de los 12 tipos: las cinco máquinas de terminación no estaban, así
 * que Planta rotulaba secciones enteras con el valor crudo del enum —"collator",
 * "stitcher"— y además las ordenaba DESPUÉS de Despacho, cuando la terminación
 * ocurre antes de que el trabajo salga del taller.
 *
 * Este módulo es el único lugar donde se decide cómo se llama y dónde va cada
 * grupo. Complementa a `MACHINE_TYPE_LABEL` de `@/types/machine-type`, que
 * nombra UNA máquina ("Dobladora"); aquí se nombra el GRUPO ("Dobladoras").
 */

import { MACHINE_TYPE_VALUES, type MachineType } from '@/types/machine-type';

/** Encabezado de sección: plural, porque titula un conjunto. */
export const MACHINE_GROUP_LABEL: Record<MachineType, string> = {
	pre_press: 'Pre-Prensa',
	offset_printer: 'Prensas Offset',
	digital_printer: 'Impresión Digital',
	guillotine: 'Guillotinas',
	die_cutter: 'Troqueladoras',
	folder: 'Dobladoras',
	collator: 'Alzadoras',
	stitcher: 'Corcheteras',
	perfect_binder: 'Hotmeleras',
	laminator: 'Polilaminadoras',
	manual_workshop: 'Taller Manual',
	delivery: 'Despacho',
};

/**
 * El orden es el camino físico que recorre un trabajo por la planta:
 * pre-prensa → impresión → corte → troquelado → terminación → taller → despacho.
 * No es alfabético ni el orden de inserción del enum, porque quien mira la
 * pantalla está siguiendo el recorrido de una OT.
 */
export const MACHINE_GROUP_ORDER: readonly MachineType[] = [
	'pre_press',
	'offset_printer',
	'digital_printer',
	'guillotine',
	'die_cutter',
	'folder',
	'collator',
	'stitcher',
	'perfect_binder',
	'laminator',
	'manual_workshop',
	'delivery',
] as const;

export function machineGroupLabel(type: string | null | undefined): string {
	return MACHINE_GROUP_LABEL[type as MachineType] ?? String(type ?? '—').replace(/_/g, ' ');
}

/** Un tipo desconocido va al final, nunca primero. */
export function machineGroupRank(type: string | null | undefined): number {
	const i = MACHINE_GROUP_ORDER.indexOf(type as MachineType);
	return i === -1 ? Number.POSITIVE_INFINITY : i;
}

export interface GroupedMachines<T> {
	type: string;
	label: string;
	machines: T[];
}

/**
 * Agrupa por `type` y ordena los grupos por el recorrido de planta. Dentro de
 * cada grupo, por nombre. Los grupos vacíos no se devuelven: un encabezado sin
 * máquinas debajo sólo ocupa pantalla.
 */
export function groupMachinesByType<T extends { name?: string | null; type?: string | null }>(
	machines: readonly T[],
): GroupedMachines<T>[] {
	const buckets = new Map<string, T[]>();

	for (const m of machines) {
		const key = m.type ?? 'other';
		const bucket = buckets.get(key);
		if (bucket) bucket.push(m);
		else buckets.set(key, [m]);
	}

	return [...buckets.entries()]
		.sort(([a], [b]) => {
			const ra = machineGroupRank(a);
			const rb = machineGroupRank(b);
			// Dos tipos desconocidos comparten rango infinito; se desempata por
			// nombre para que el orden no dependa del azar del Map.
			return ra === rb ? a.localeCompare(b, 'es') : ra - rb;
		})
		.map(([type, rows]) => ({
			type,
			label: machineGroupLabel(type),
			machines: [...rows].sort((x, y) =>
				String(x.name ?? '').localeCompare(String(y.name ?? ''), 'es'),
			),
		}));
}

/** Toda máquina del enum tiene encabezado. La prueba lo verifica. */
export const ALL_TYPES_LABELLED = MACHINE_TYPE_VALUES.every((t) => !!MACHINE_GROUP_LABEL[t]);
