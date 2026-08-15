/**
 * El estante de troqueles.
 *
 * Un troquel es una herramienta física: madera con cuchillas, guardada en una
 * estantería del taller. Cuesta del orden de $320.000, tarda dos semanas en
 * llegar, y se puede usar decenas de veces. Es, junto con las prensas, el
 * activo más caro que el taller tiene fuera de las máquinas.
 *
 * ── Por qué esto es un módulo y no un campo ─────────────────────────────────
 *
 * La aplicación cotizaba todo trabajo troquelado como si hubiera que mandar a
 * hacer un troquel nuevo. No por una regla equivocada: porque no había forma de
 * contestar «¿tenemos uno que sirva?» sin caminar hasta el estante y revisar a
 * ojo. Un dato que cuesta una caminata es un dato que no se consulta, así que
 * en la práctica se compraba de nuevo.
 *
 * Reutilizar no es sólo ahorrarse la compra: es ahorrarse las DOS SEMANAS. Un
 * troquel nuevo puede ser la diferencia entre entregar el día 12 y el día 26, y
 * eso se decide en Pre-Prensa o no se decide.
 *
 * ── Cómo se busca ───────────────────────────────────────────────────────────
 *
 * Un troquel corta UNA forma. No sirve «parecido»: si el trabajo es de 9×12 y
 * el troquel es de 9,5×12, la pieza sale mal. La tolerancia existe sólo para
 * absorber cómo se anotó la medida, no para estirar el calce.
 */

import { DEFAULT_COSTS } from './ot-calculations';

/**
 * Lo que cuesta uno nuevo, y lo que tarda.
 *
 * El costo NO se define acá: se toma del catálogo del motor de costeo, que es
 * quien lo cobra. Tenerlo escrito en los dos lados hacía que al calibrarlo
 * contra las facturas reales la pantalla dijera «ahorrás $320.000» mientras el
 * motor cotizaba otra cosa — dos verdades para un número, que es justo el
 * problema que este proyecto lleva meses cerrando.
 */
export const NEW_DIE_COST_CLP = DEFAULT_COSTS.die_tooling;
/** Los días son del proveedor de troqueles, no del catálogo de costos. */
export const NEW_DIE_LEAD_DAYS = 14;

/** Cuánto puede diferir la medida y seguir siendo el mismo troquel. Es
 *  tolerancia de ANOTACIÓN —9 vs 9,0— no de calce. */
export const DIE_TOLERANCE_CM = 0.2;

export type DieStatus = 'activo' | 'desgastado' | 'dado_de_baja';

export interface Die {
	id: string;
	code: string;
	name: string;
	productType?: string | null;
	widthCm?: number | null;
	heightCm?: number | null;
	cavities: number;
	shelfLocation?: string | null;
	clientId?: string | null;
	/** Hecho para un cliente y no reutilizable con otro: una caja con su logo
	 *  troquelado no sirve para nadie más, aunque mida lo mismo. */
	exclusive: boolean;
	acquisitionCost?: number | null;
	status: DieStatus;
	timesUsed: number;
	lastUsedAt?: string | null;
}

export interface JobShape {
	widthCm?: number | null;
	heightCm?: number | null;
	productType?: string | null;
	clientId?: string | null;
}

export interface Match {
	die: Die;
	/** Si se puede usar tal cual. */
	usable: boolean;
	/** Por qué sí o por qué no, en el idioma del taller. */
	reasons: string[];
	/** Para ordenar: más alto, mejor candidato. */
	score: number;
}

const cerca = (a: number, b: number) => Math.abs(a - b) <= DIE_TOLERANCE_CM;

/**
 * ¿Este troquel sirve para este trabajo?
 *
 * Prueba la medida en las dos orientaciones: un troquel de 12×9 corta lo mismo
 * que uno de 9×12, y no reconocerlo haría comprar de nuevo algo que está en el
 * estante.
 */
export function matchDie(die: Die, job: JobShape): Match {
	const razones: string[] = [];
	let score = 0;

	const medidasConocidas =
		die.widthCm != null && die.heightCm != null && job.widthCm != null && job.heightCm != null;

	const calza = medidasConocidas
		? (cerca(die.widthCm!, job.widthCm!) && cerca(die.heightCm!, job.heightCm!)) ||
		  (cerca(die.widthCm!, job.heightCm!) && cerca(die.heightCm!, job.widthCm!))
		: false;

	if (!medidasConocidas) {
		razones.push('Falta la medida para poder compararlo.');
	} else if (!calza) {
		razones.push(`Mide ${die.widthCm}×${die.heightCm}, el trabajo es ${job.widthCm}×${job.heightCm}.`);
	} else {
		score += 100;
		razones.push('La medida calza.');
	}

	if (die.status === 'dado_de_baja') {
		razones.push('Está dado de baja.');
	} else if (die.status === 'desgastado') {
		// No lo descarta: a veces es lo que hay y el trabajo lo tolera. Pero
		// enterarse cuando la pieza sale con rebaba es tarde.
		score -= 30;
		razones.push('Está desgastado: revisar el filo antes de comprometer la fecha.');
	}

	// Un troquel exclusivo de otro cliente no se usa aunque mida igual.
	const deOtroCliente = die.exclusive && die.clientId != null && die.clientId !== job.clientId;
	if (deOtroCliente) {
		razones.push('Es exclusivo de otro cliente.');
	} else if (die.clientId != null && die.clientId === job.clientId) {
		score += 20;
		razones.push('Ya es de este cliente.');
	}

	if (job.productType && die.productType && job.productType === die.productType) {
		score += 10;
	}

	// Entre dos que calzan, el más usado es el que el taller conoce mejor.
	score += Math.min(die.timesUsed, 20) / 4;

	const usable = calza && die.status !== 'dado_de_baja' && !deOtroCliente;
	return { die, usable, reasons: razones, score };
}

/**
 * Los troqueles del estante que sirven para este trabajo, mejor primero.
 *
 * Devuelve sólo los usables: una lista que mezcla los que sirven con los que no
 * obliga a leerla entera, y el objetivo es que la respuesta se vea sin leer.
 */
export function suggestDies(dies: readonly Die[], job: JobShape): Match[] {
	return dies
		.map((d) => matchDie(d, job))
		.filter((m) => m.usable)
		.sort((a, b) => b.score - a.score);
}

/**
 * Lo que se ahorra usando uno que ya está.
 *
 * Los días importan más que los pesos y por eso van juntos: $320.000 se
 * discuten, dos semanas de atraso no se discuten con nadie.
 */
export function reuseSavings(): { clp: number; days: number } {
	return { clp: NEW_DIE_COST_CLP, days: NEW_DIE_LEAD_DAYS };
}

/**
 * Cuánto salió cada uso de este troquel.
 *
 * Es el número que convierte una compra en una inversión: un troquel de
 * $320.000 usado veinte veces costó $16.000 por trabajo. Sin esto, cada compra
 * se ve cara y ninguna se ve amortizada.
 */
export function costPerUse(die: Die): number | null {
	if (die.acquisitionCost == null || die.acquisitionCost <= 0) return null;
	return Math.round(die.acquisitionCost / Math.max(die.timesUsed, 1));
}

/**
 * El estante, resumido: cuánto vale, cuánto se está usando y qué está muerto.
 *
 * Un troquel que nunca se volvió a usar no es un activo, es una compra que se
 * hizo una vez — y saber cuántos hay de esos es lo que cambia la política de
 * «mandamos a hacer uno» a «primero fijate».
 */
export function shelfHealth(dies: readonly Die[]): {
	total: number;
	activos: number;
	invertido: number;
	usadosUnaVez: number;
	nuncaUsados: number;
} {
	const activos = dies.filter((d) => d.status === 'activo');
	return {
		total: dies.length,
		activos: activos.length,
		invertido: dies.reduce((a, d) => a + (d.acquisitionCost ?? 0), 0),
		usadosUnaVez: dies.filter((d) => d.timesUsed === 1).length,
		nuncaUsados: dies.filter((d) => d.timesUsed === 0).length,
	};
}
