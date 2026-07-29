/**
 * Qué competencias exige cada clase de máquina — propuesta inicial.
 *
 * Mismo problema que con los repuestos: "definí las competencias de la
 * corchetera" es una hoja en blanco. Y acá el costo de dejarla en blanco es
 * mayor, porque una máquina sin requisitos declarados no dice "cualquiera
 * puede operarla": dice que no sabemos nada, y en la práctica nadie la define
 * nunca. `machine_skill_requirements` llevaba meses en cero por eso.
 *
 * Se apoya en el catálogo `skills` que ya existe, referenciando por `code`.
 * Un código que no exista en el taller simplemente se ignora — la plantilla no
 * inventa competencias, sólo propone cuáles de las que hay aplican a qué
 * máquina.
 *
 * Los NIVELES son un punto de partida sensato, no una verdad: cada taller
 * decide qué tan exigente es con su gente, y por eso quedan editables antes de
 * aplicarse.
 */

import type { MachineType } from '@/types/machine-type';

export interface CompetencyTemplateItem {
	/** `code` en la tabla `skills`. */
	skill_code: string;
	min_proficiency: number;
	is_critical: boolean;
	requires_certification?: boolean;
	supervised_hours_required?: number;
	/** Por qué esta máquina la exige. Se muestra al confirmar. */
	reason?: string;
}

/** Nadie toca una máquina del taller sin esto. */
const BASE: CompetencyTemplateItem[] = [
	{ skill_code: 'SAFETY_AWARENESS', min_proficiency: 2, is_critical: true,
	  reason: 'Punto de partida de cualquier máquina con partes en movimiento.' },
	{ skill_code: 'MACHINERY_BASICS', min_proficiency: 2, is_critical: true },
];

const MEDICION: CompetencyTemplateItem = {
	skill_code: 'MEASUREMENT_READING', min_proficiency: 2, is_critical: false,
	reason: 'Sin leer una medida no se ajusta el registro ni se verifica el corte.',
};

export const COMPETENCY_TEMPLATES: Partial<Record<MachineType, CompetencyTemplateItem[]>> = {
	offset_printer: [
		...BASE, MEDICION,
		{ skill_code: 'OFFSET_PRESS_BASIC', min_proficiency: 3, is_critical: true,
		  requires_certification: true, supervised_hours_required: 80,
		  reason: 'Es la máquina más cara del taller y la que más material desperdicia mal operada.' },
		{ skill_code: 'PRE_PRESS_SETUP', min_proficiency: 2, is_critical: false },
		{ skill_code: 'QUALITY_CONTROL', min_proficiency: 2, is_critical: true },
	],

	guillotine: [
		...BASE, MEDICION,
		{ skill_code: 'GUILLOTINE_BASIC', min_proficiency: 3, is_critical: true,
		  requires_certification: true, supervised_hours_required: 40,
		  reason: 'La cuchilla no perdona: la certificación acá es de seguridad, no de calidad.' },
		{ skill_code: 'QUALITY_CONTROL', min_proficiency: 2, is_critical: false },
	],

	die_cutter: [
		...BASE, MEDICION,
		{ skill_code: 'DIE_CUTTING', min_proficiency: 3, is_critical: true,
		  requires_certification: true, supervised_hours_required: 60 },
		{ skill_code: 'QUALITY_CONTROL', min_proficiency: 2, is_critical: false },
	],

	folder: [
		...BASE, MEDICION,
		{ skill_code: 'BINDING_ASSEMBLY', min_proficiency: 2, is_critical: true,
		  supervised_hours_required: 24,
		  reason: 'El plegado mal escuadrado arruina el trabajo recién en la etapa siguiente.' },
		{ skill_code: 'FINISHING_QUALITY', min_proficiency: 2, is_critical: false },
	],

	collator: [
		...BASE,
		{ skill_code: 'BINDING_ASSEMBLY', min_proficiency: 2, is_critical: true,
		  supervised_hours_required: 16 },
		{ skill_code: 'MATERIAL_HANDLING', min_proficiency: 2, is_critical: false },
		{ skill_code: 'FINISHING_QUALITY', min_proficiency: 2, is_critical: true,
		  reason: 'Un pliego doble o faltante no se ve hasta el producto terminado.' },
	],

	stitcher: [
		...BASE,
		{ skill_code: 'BINDING_ASSEMBLY', min_proficiency: 3, is_critical: true,
		  supervised_hours_required: 32 },
		{ skill_code: 'FINISHING_QUALITY', min_proficiency: 2, is_critical: false },
	],

	perfect_binder: [
		...BASE, MEDICION,
		{ skill_code: 'BINDING_ASSEMBLY', min_proficiency: 3, is_critical: true,
		  requires_certification: true, supervised_hours_required: 40,
		  reason: 'Olla de cola a temperatura y fresado de lomo: quema y arruina el tiraje entero.' },
		{ skill_code: 'FINISHING_QUALITY', min_proficiency: 3, is_critical: true },
		{ skill_code: 'EQUIPMENT_MAINTENANCE', min_proficiency: 2, is_critical: false,
		  reason: 'La limpieza de la olla es mantenimiento diario del operario, no del mecánico.' },
	],

	laminator: [
		...BASE, MEDICION,
		{ skill_code: 'LAMINATION', min_proficiency: 3, is_critical: true,
		  requires_certification: true, supervised_hours_required: 40 },
		{ skill_code: 'FINISHING_QUALITY', min_proficiency: 2, is_critical: true },
	],

	digital_printer: [
		...BASE,
		{ skill_code: 'PRE_PRESS_SETUP', min_proficiency: 2, is_critical: true },
		{ skill_code: 'QUALITY_CONTROL', min_proficiency: 2, is_critical: false },
	],

	pre_press: [
		{ skill_code: 'SAFETY_AWARENESS', min_proficiency: 1, is_critical: false },
		{ skill_code: 'PRE_PRESS_SETUP', min_proficiency: 3, is_critical: true },
		{ skill_code: 'MEASUREMENT_READING', min_proficiency: 3, is_critical: true },
	],

	manual_workshop: [
		...BASE,
		{ skill_code: 'MANUAL_WORKSHOP', min_proficiency: 2, is_critical: true },
		{ skill_code: 'HAND_TOOLS', min_proficiency: 2, is_critical: false },
	],

	delivery: [
		{ skill_code: 'SAFETY_AWARENESS', min_proficiency: 2, is_critical: true },
		{ skill_code: 'MATERIAL_HANDLING', min_proficiency: 2, is_critical: true,
		  reason: 'Cargar mal el pliego terminado es perderlo después de todo el proceso.' },
	],
};

export function competencyTemplateFor(machineType: string): CompetencyTemplateItem[] {
	return COMPETENCY_TEMPLATES[machineType as MachineType] ?? BASE;
}
