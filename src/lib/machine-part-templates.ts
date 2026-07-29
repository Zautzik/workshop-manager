/**
 * Plantillas de piezas por clase de máquina.
 *
 * Pedirle a alguien "cargá los repuestos de la dobladora" es entregarle una
 * hoja en blanco: hay que acordarse de todo, y lo que no se recuerda no existe.
 * Estas plantillas invierten el trabajo — en vez de inventar la lista, se
 * confirma o se tacha una que ya viene armada por sistema.
 *
 * LÍMITE DELIBERADO: acá va sólo lo que depende de la CLASE de máquina — qué
 * pieza existe, a qué sistema pertenece y qué tan crítica es. NO van número de
 * parte, proveedor, plazo de reposición ni vida útil: eso depende del modelo
 * exacto, del manual y del proveedor de cada taller. Inventarlos daría una
 * app que proyecta fechas de compra sobre datos que nadie verificó, que es
 * peor que no proyectar nada.
 */

import type { MachineType } from '@/types/machine-type';
import type { PartCriticality } from '@/lib/part-procurement';

export interface PartTemplateItem {
	/** `code` de machine_systems. */
	system: string;
	name: string;
	criticality: PartCriticality;
	/** Dónde suele ir, cuando la máquina tiene más de una. */
	position?: string;
	/** Por qué importa — se muestra al confirmar la plantilla. */
	note?: string;
}

/** Piezas que cualquier máquina con motor y tablero termina teniendo. */
const COMUNES: PartTemplateItem[] = [
	{ system: 'motriz', name: 'Correa de transmisión principal', criticality: 'alta' },
	{ system: 'motriz', name: 'Rodamientos del eje principal', criticality: 'alta' },
	{ system: 'electrico', name: 'Contactor de motor principal', criticality: 'alta' },
	{ system: 'electrico', name: 'Fusibles de tablero', criticality: 'media' },
	{ system: 'lubricacion', name: 'Filtro de la bomba de engrase', criticality: 'media' },
	{ system: 'seguridad', name: 'Botonera de parada de emergencia', criticality: 'critica',
	  note: 'Si falla, la máquina no debería operar aunque todo lo demás funcione.' },
];

const NEUMATICOS: PartTemplateItem[] = [
	{ system: 'neumatico', name: 'Filtro regulador de aire (FRL)', criticality: 'alta' },
	{ system: 'neumatico', name: 'Mangueras y racores de aire', criticality: 'media' },
	{ system: 'neumatico', name: 'Ventosas de succión', criticality: 'alta',
	  note: 'Gastadas hacen que el pliego entre chueco o doble.' },
];

const HIDRAULICOS: PartTemplateItem[] = [
	{ system: 'hidraulico', name: 'Filtro de aceite hidráulico', criticality: 'alta' },
	{ system: 'hidraulico', name: 'Mangueras de alta presión', criticality: 'alta' },
	{ system: 'hidraulico', name: 'Sellos y retenes de cilindro', criticality: 'media' },
];

export const PART_TEMPLATES: Partial<Record<MachineType, PartTemplateItem[]>> = {
	offset_printer: [
		...COMUNES, ...NEUMATICOS,
		{ system: 'mantillas', name: 'Mantilla de caucho', criticality: 'critica', position: 'por cuerpo',
		  note: 'Consumible de desgaste: es la que primero marca la calidad de impresión.' },
		{ system: 'mantillas', name: 'Lámina de calce bajo mantilla', criticality: 'media' },
		{ system: 'entintado', name: 'Rodillo dador de tinta', criticality: 'critica', position: 'por cuerpo' },
		{ system: 'entintado', name: 'Rodillo distribuidor', criticality: 'alta', position: 'por cuerpo' },
		{ system: 'entintado', name: 'Cuchilla del tintero', criticality: 'media' },
		{ system: 'mojado', name: 'Rodillo de mojado (felpa/goma)', criticality: 'alta', position: 'por cuerpo' },
		{ system: 'mojado', name: 'Filtro de solución fuente', criticality: 'media' },
		{ system: 'transporte', name: 'Gomas de pinzas', criticality: 'alta',
		  note: 'Gastadas sueltan el pliego y descuadran el registro.' },
		{ system: 'transporte', name: 'Cintas de transporte de mesa', criticality: 'media' },
		{ system: 'transporte', name: 'Ruedas del marcador', criticality: 'media' },
		{ system: 'refrigeracion', name: 'Filtro del chiller', criticality: 'media' },
	],

	guillotine: [
		...COMUNES, ...HIDRAULICOS,
		{ system: 'corte', name: 'Cuchilla', criticality: 'critica',
		  note: 'Conviene tener una de repuesto afilada: mientras una está en el afilador, la otra corta.' },
		{ system: 'corte', name: 'Listón de corte (palo de nylon)', criticality: 'alta' },
		{ system: 'corte', name: 'Gomas del pisón', criticality: 'media' },
		{ system: 'corte', name: 'Escuadra lateral', criticality: 'media' },
	],

	die_cutter: [
		...COMUNES, ...NEUMATICOS, ...HIDRAULICOS,
		{ system: 'troquelado', name: 'Contramatriz / placa de corte', criticality: 'alta' },
		{ system: 'troquelado', name: 'Gomas de expulsión', criticality: 'media' },
		{ system: 'transporte', name: 'Gomas de pinzas', criticality: 'alta' },
	],

	folder: [
		...COMUNES, ...NEUMATICOS,
		{ system: 'plegado', name: 'Cuchilla de plegado', criticality: 'alta' },
		{ system: 'plegado', name: 'Tope de bolsa', criticality: 'media' },
		{ system: 'arrastre', name: 'Rodillos de goma de arrastre', criticality: 'critica',
		  note: 'Gastados el pliego patina y el plegado se corre.' },
		{ system: 'arrastre', name: 'Resortes de presión de rodillo', criticality: 'media' },
		{ system: 'transporte', name: 'Cintas de transporte', criticality: 'alta' },
	],

	collator: [
		...COMUNES, ...NEUMATICOS,
		{ system: 'alzado', name: 'Ventosas de estación', criticality: 'critica', position: 'por torre' },
		{ system: 'alzado', name: 'Sensor de doble pliego', criticality: 'alta',
		  note: 'Cuando falla, el error recién se ve en el producto terminado.' },
		{ system: 'alzado', name: 'Gomas separadoras', criticality: 'alta', position: 'por torre' },
		{ system: 'arrastre', name: 'Rodillos de arrastre', criticality: 'media' },
	],

	stitcher: [
		...COMUNES, ...NEUMATICOS,
		{ system: 'corchete', name: 'Cabezal de corchete completo', criticality: 'critica' },
		{ system: 'corchete', name: 'Formador de corchete', criticality: 'alta' },
		{ system: 'corchete', name: 'Yunque (clinch)', criticality: 'alta' },
		{ system: 'corchete', name: 'Guía de alambre', criticality: 'media' },
		{ system: 'transporte', name: 'Cadena transportadora', criticality: 'media' },
	],

	perfect_binder: [
		...COMUNES, ...NEUMATICOS,
		{ system: 'encolado', name: 'Resistencia de la olla de cola', criticality: 'critica',
		  note: 'Sin temperatura no hay encolado: la máquina queda parada entera.' },
		{ system: 'encolado', name: 'Termocupla de la olla', criticality: 'alta' },
		{ system: 'encolado', name: 'Rodillo aplicador de cola', criticality: 'alta' },
		{ system: 'fresado', name: 'Fresa de lomo', criticality: 'critica' },
		{ system: 'fresado', name: 'Filtro de aspiración de polvillo', criticality: 'media' },
		{ system: 'mordazas', name: 'Gomas de mordaza', criticality: 'alta' },
		{ system: 'mordazas', name: 'Cadena de transporte de libro', criticality: 'media' },
		{ system: 'termico', name: 'Controlador de temperatura', criticality: 'alta' },
	],

	laminator: [
		...COMUNES, ...NEUMATICOS,
		{ system: 'termico', name: 'Resistencia del rodillo calefactor', criticality: 'critica' },
		{ system: 'termico', name: 'Termocupla', criticality: 'alta' },
		{ system: 'bobina', name: 'Freno de portabobina', criticality: 'alta',
		  note: 'Mal frenado el film se arruga y se pierde el pliego.' },
		{ system: 'bobina', name: 'Eje expansible / mandril', criticality: 'media' },
		{ system: 'arrastre', name: 'Rodillo de presión (silicona)', criticality: 'critica' },
		{ system: 'corte', name: 'Cuchilla de separación', criticality: 'media' },
	],

	digital_printer: [
		...COMUNES,
		{ system: 'transporte', name: 'Rodillos de alimentación', criticality: 'alta' },
		{ system: 'transporte', name: 'Gomas separadoras de papel', criticality: 'media' },
		{ system: 'control', name: 'Fusor / unidad de fijación', criticality: 'alta' },
	],

	delivery: [
		{ system: 'motriz', name: 'Correa de distribución', criticality: 'alta' },
		{ system: 'motriz', name: 'Filtro de aceite de motor', criticality: 'media' },
		{ system: 'rodadura', name: 'Neumáticos', criticality: 'alta' },
		{ system: 'rodadura', name: 'Pastillas de freno', criticality: 'critica' },
		{ system: 'rodadura', name: 'Amortiguadores', criticality: 'media' },
		{ system: 'electrico', name: 'Batería', criticality: 'alta' },
	],
};

export function partTemplateFor(machineType: string): PartTemplateItem[] {
	return PART_TEMPLATES[machineType as MachineType] ?? COMUNES;
}

export function hasTemplate(machineType: string): boolean {
	return machineType in PART_TEMPLATES;
}
