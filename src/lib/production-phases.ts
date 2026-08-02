/**
 * Las fases por las que pasa un trabajo en el taller.
 *
 * Este vocabulario nació dentro del Kanban (`OTManagement`), donde agrupa las
 * ETAPAS de una OT. Aquí sale del componente para que otras pantallas puedan
 * hablar el mismo idioma sin copiarlo: si Equipos dijera "Terminación" con su
 * propia lista, los dos nombres se separarían en cuanto alguien tocara uno.
 *
 * Una fase agrupa dos cosas distintas pero paralelas:
 *   · `stages`  — los estados de una OT que ocurren en esa fase (Kanban)
 *   · el tipo de máquina que hace ese trabajo (Equipos, ver `machine-groups`)
 */

export const PRODUCTION_PHASES = [
	{
		id: 'diseno',
		label: 'Diseño',
		rgb: '139 92 246',
		borderColor: 'border-violet-500/30',
		bgColor: 'bg-violet-500/5',
		stages: ['pre_press', 'visto_bueno'],
	},
	{
		id: 'compras',
		label: 'Compras & Bodega',
		rgb: '6 182 212',
		borderColor: 'border-cyan-500/30',
		bgColor: 'bg-cyan-500/5',
		stages: ['paper_purchase', 'in_storage'],
	},
	{
		id: 'produccion',
		label: 'Corte & Impresión',
		rgb: '249 115 22',
		borderColor: 'border-orange-500/30',
		bgColor: 'bg-orange-500/5',
		stages: ['guillotine_first_cut', 'offset_printing', 'digital_printing'],
	},
	{
		id: 'acabados',
		label: 'Acabados',
		rgb: '236 72 153',
		borderColor: 'border-pink-500/30',
		bgColor: 'bg-pink-500/5',
		stages: ['die_cutting', 'guillotine_final_cut'],
	},
	{
		id: 'terminacion',
		label: 'Terminación',
		rgb: '99 102 241',
		borderColor: 'border-indigo-500/30',
		bgColor: 'bg-indigo-500/5',
		stages: ['workshop', 'outsourced', 'workshop_revision'],
	},
	{
		id: 'despacho',
		label: 'Despacho',
		rgb: '34 197 94',
		borderColor: 'border-green-500/30',
		bgColor: 'bg-green-500/5',
		stages: ['ready_for_delivery', 'in_delivery', 'completed'],
	},
] as const;

export type ProductionPhase = (typeof PRODUCTION_PHASES)[number];
export type ProductionPhaseId = ProductionPhase['id'];

export const PHASE_LABEL: Record<ProductionPhaseId, string> = Object.fromEntries(
	PRODUCTION_PHASES.map((p) => [p.id, p.label]),
) as Record<ProductionPhaseId, string>;

/** Posición de la fase en el recorrido. Un id desconocido va al final. */
export function phaseRank(id: string | null | undefined): number {
	const i = PRODUCTION_PHASES.findIndex((p) => p.id === id);
	return i === -1 ? Number.POSITIVE_INFINITY : i;
}

export function phaseLabel(id: string | null | undefined): string {
	return PHASE_LABEL[id as ProductionPhaseId] ?? String(id ?? '—');
}
