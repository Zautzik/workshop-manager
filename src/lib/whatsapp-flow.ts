/**
 * Lo que un mensaje del taller le hace a la OT.
 *
 * El parser ya entiende los partes reales —«Fin OT 40879, 7600 pliegos, 300 de
 * merma, 6 horas, entro OT 40965»— y saca de ahí horas, merma, procesos y
 * problemas. Lo que faltaba era el otro lado: qué hacer con eso. Hasta hoy sólo
 * los costos inferidos tenían destino; las horas, la merma y los problemas se
 * guardaban en `parsed_data` y no los leía nadie, y ningún mensaje movía una OT.
 *
 * Este módulo es la traducción que faltaba: del vocabulario del taller —«salió
 * del troquel», «listo el barniz», «entregado»— a las dos decisiones que el
 * sistema entiende: QUÉ PASADA SE CIERRA y A DÓNDE VA LA OT.
 *
 * ── Vale para todas las etapas, no sólo para la prensa ──────────────────────
 *
 * El parser nació mirando el offset y su vocabulario se quedó ahí: sabía decir
 * «troquelado» y «guillotina», pero no «revisado», «entregado» ni «taller». Un
 * mensaje del que corta, del que arma o del que reparte caía como `unknown`. Se
 * completó el vocabulario porque el prensista no es el único que tiene un
 * teléfono en el bolsillo, y las horas del reparto valen lo mismo que las de la
 * máquina.
 *
 * ── Por qué la etapa se deduce de dónde está la OT ──────────────────────────
 *
 * «Corte» es la palabra más usada del taller y significa dos cosas distintas:
 * el corte inicial del pliego y el corte final del producto. Pedirle al
 * operario que distinga es pedirle que aprenda el vocabulario del software. La
 * ambigüedad se resuelve sola mirando dónde está la OT: si todavía no imprimió,
 * «corte» es el primero; si ya troqueló, es el final.
 *
 * Puro, sin I/O: recibe el estado de la OT y lo que el parser sacó, y devuelve
 * una propuesta. Aplicarla es de otro.
 */

import { naturalNextStatuses, type OTWorkflowStatus } from '@/lib/ot-state-machine';
import { promptsStageReport } from '@/lib/stage-report';

/**
 * Del vocabulario del taller a las etapas del sistema.
 *
 * Las claves son los `processes_mentioned` que devuelve el parser. `corte` y
 * `guillotina` no están acá a propósito: son ambiguas y las resuelve
 * `resolveCutStage` con la posición de la OT.
 */
const PROCESO_A_ETAPA: Record<string, OTWorkflowStatus> = {
	impresion_offset: 'offset_printing',
	impresion: 'offset_printing',
	impresion_digital: 'digital_printing',
	troquelado: 'die_cutting',
	// Todo lo que se hace a mano o en las máquinas chicas es Taller. Son
	// procesos distintos entre sí, pero para el recorrido de la OT son el mismo
	// lugar: el mesón donde se arma el producto.
	doblado: 'workshop',
	pegado: 'workshop',
	corchetes: 'workshop',
	empaque: 'workshop',
	encuadernado: 'workshop',
	laminado: 'workshop',
	barniz: 'workshop',
	serigrafia: 'workshop',
	hot_stamping: 'workshop',
	uv_localizado: 'workshop',
	perforado: 'workshop',
	numeracion: 'workshop',
	relieve: 'workshop',
	taller: 'workshop',
	revision: 'workshop_revision',
	entrega: 'in_delivery',
	entregado: 'completed',
	tercerizado: 'outsourced',
};

/** Etapas donde «corte» significa el primer corte, no el final. */
const ANTES_DE_IMPRIMIR: readonly string[] = [
	'paper_purchase',
	'in_storage',
	'guillotine_first_cut',
];

/**
 * «Corte» y «guillotina» sin más datos: se decide por dónde está la OT.
 *
 * Antes de la prensa es el corte del pliego; después del troquel es el corte
 * del producto terminado. En el medio —la OT está imprimiendo— lo más probable
 * es que el operario esté anunciando lo que viene, que es el corte final.
 */
export function resolveCutStage(currentStatus: string): OTWorkflowStatus {
	return ANTES_DE_IMPRIMIR.includes(currentStatus)
		? 'guillotine_first_cut'
		: 'guillotine_final_cut';
}

export interface FlowParse {
	message_type?: string | null;
	hours_reported?: number | null;
	merma?: number | null;
	pliegos_produced?: number | null;
	processes_mentioned?: readonly string[] | null;
	problems_reported?: readonly string[] | null;
	unparsed_notes?: string | null;
	confidence?: number | null;
}

export interface FlowProposal {
	/** La pasada que este parte cierra. `null` si la etapa no lleva pasada. */
	closeStage: OTWorkflowStatus | null;
	/** A dónde mover la OT. `null` cuando no se puede afirmar. */
	nextStatus: OTWorkflowStatus | null;
	hours: number | null;
	mermaSheets: number | null;
	issues: string | null;
	observations: string | null;
	/** 0–100, heredada del parser. Decide si se aplica sola o va a revisión. */
	confidence: number;
	/** En el idioma del taller, para que el supervisor entienda la propuesta. */
	reason: string;
}

const num = (v: unknown): number | null =>
	typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

const texto = (v: readonly string[] | null | undefined): string | null => {
	const t = (v ?? []).map((x) => String(x).trim()).filter(Boolean);
	return t.length > 0 ? t.join('; ') : null;
};

/**
 * Las etapas que el mensaje nombra, traducidas y en orden de aparición.
 *
 * Se devuelven todas porque un parte suele nombrar la que termina y la que
 * empieza —«listo el troquel, entro a corte»— y quien decide necesita las dos.
 */
export function stagesMentioned(
	processes: readonly string[] | null | undefined,
	currentStatus: string,
): OTWorkflowStatus[] {
	const out: OTWorkflowStatus[] = [];
	for (const p of processes ?? []) {
		const etapa =
			p === 'corte' || p === 'guillotina' ? resolveCutStage(currentStatus) : PROCESO_A_ETAPA[p];
		if (etapa && !out.includes(etapa)) out.push(etapa);
	}
	return out;
}

/**
 * Qué le hace este parte a la OT.
 *
 * La regla de oro: la pasada que se cierra es la etapa donde la OT ESTÁ, no la
 * que el mensaje nombra. Un operario que escribe «listo el troquelado» está
 * diciendo que terminó lo que tenía entre manos, y lo que tenía entre manos es
 * lo que dice el tablero. Creerle al texto por sobre el estado haría que un
 * mensaje mal tipeado cerrara la pasada equivocada — y una hora cargada en la
 * etapa que no es, es peor que no tenerla.
 *
 * El texto sí decide a DÓNDE VA, que es la parte que el sistema no puede saber
 * solo cuando hay una bifurcación.
 */
export function resolveFlow(
	currentStatus: string,
	parse: FlowParse,
): FlowProposal {
	const confidence = typeof parse.confidence === 'number' ? parse.confidence : 0;
	const hours = num(parse.hours_reported);
	const mermaSheets =
		typeof parse.merma === 'number' && Number.isFinite(parse.merma) && parse.merma >= 0
			? Math.trunc(parse.merma)
			: null;

	// Sólo un parte de TÉRMINO mueve algo. Un «inicio» dice que alguien se puso a
	// trabajar, que es útil para el reloj pero no cambia dónde está la OT.
	const esFin = parse.message_type === 'end';

	const closeStage: OTWorkflowStatus | null =
		esFin && promptsStageReport(currentStatus) ? (currentStatus as OTWorkflowStatus) : null;

	const mencionadas = stagesMentioned(parse.processes_mentioned, currentStatus);
	const naturales = naturalNextStatuses(currentStatus as OTWorkflowStatus);

	// A dónde va: primero lo que el mensaje nombra, si es un destino posible.
	// Un proceso nombrado que NO está en el recorrido siguiente casi siempre es
	// el que se acaba de terminar («listo el troquelado» estando en el troquel),
	// y por eso no se toma como destino.
	let nextStatus: OTWorkflowStatus | null =
		mencionadas.find((e) => naturales.includes(e)) ?? null;
	let reason: string;

	if (!esFin) {
		reason = 'Parte de inicio: no mueve la OT.';
	} else if (nextStatus) {
		reason = `El parte nombra ${nextStatus}, que es uno de los pasos posibles desde acá.`;
	} else if (naturales.length === 1) {
		// Sin bifurcación no hay nada que preguntar: el recorrido tiene un solo
		// paso siguiente y el operario ya dijo que terminó.
		nextStatus = naturales[0];
		reason = 'Desde esta etapa hay un solo paso siguiente.';
	} else if (naturales.length > 1) {
		// Hay elección real —offset o digital, taller o tercerizado— y el mensaje
		// no la resolvió. Se cierra la pasada y la decisión queda para quien sabe.
		reason =
			`Termina la etapa, pero desde acá se puede seguir a ${naturales.length} lugares ` +
			'y el mensaje no dice a cuál. Elegilo vos.';
	} else {
		reason = 'La OT ya está al final del recorrido.';
	}

	return {
		closeStage,
		nextStatus,
		hours,
		mermaSheets,
		issues: texto(parse.problems_reported),
		// `unparsed_notes` NO va a observaciones. Suena a que ahí está lo que el
		// parser no supo leer, pero en la práctica es el resto del mensaje entero
		// —«, 7600 pliegos, 300 de merma, 6 horas»— es decir, los mismos números
		// que ya están en sus columnas. Guardarlo llenaría la pasada de ruido que
		// parece observación del operario. El texto original queda íntegro en la
		// captura, que es donde hay que ir a mirarlo.
		observations: null,
		confidence,
		reason,
	};
}

/**
 * Umbral para aplicar sin que nadie mire.
 *
 * El parser ya calcula una confianza y nadie la leía. 70 es donde un mensaje
 * trae OT reconocida, tipo de parte claro y al menos una cifra: por debajo se
 * está adivinando, y adivinar horas es peor que no tenerlas.
 *
 * Mover la OT es reversible con un retroceso; cerrar una pasada con la hora
 * equivocada contamina el costo del trabajo y el histórico de la máquina. Por
 * eso el umbral se aplica al conjunto: o entra todo revisado, o entra todo.
 */
export const CONFIANZA_PARA_APLICAR_SOLO = 70;

export function appliesWithoutReview(p: FlowProposal): boolean {
	return p.confidence >= CONFIANZA_PARA_APLICAR_SOLO;
}
