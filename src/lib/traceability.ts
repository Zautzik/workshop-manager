/**
 * El lote, del pallet a la pantalla.
 *
 * La trazabilidad ya estaba resuelta en la base: el consumo exige
 * `work_order_id`, así que de un lote se llega a las OT que lo usaron y de ahí
 * a sus clientes. Lo que faltaba era el eslabón del MUNDO FÍSICO — entre el
 * pallet que está en bodega y la fila de la tabla no había nada.
 *
 * El operario que va a cortar tiene el papel delante y no sabe qué lote es. Si
 * no lo sabe, no lo registra; y una trazabilidad que depende de que alguien
 * recuerde un número de catorce dígitos no es una trazabilidad, es una
 * intención.
 *
 * ── Por qué el QR y no un código escrito ────────────────────────────────────
 *
 * Porque el acto ya existe. El operario saca el teléfono, apunta y sigue
 * trabajando: no hay que enseñarle un sistema nuevo ni pedirle que camine hasta
 * un terminal. Lo que se captura es el gesto que ya hace, no uno que le
 * agregamos.
 */

import { WH_QR_PREFIX } from '@/types/whatsapp-warehouse';

/* ─── El código impreso ──────────────────────────────────────────────────── */

/**
 * El QR de un lote.
 *
 * Sigue el formato que el taller ya usa —`WH:<ACCIÓN>:<id>[:<extra>]`— en vez
 * de inventar uno nuevo. Un segundo formato significaría dos lectores, y el
 * día que alguien escanee la etiqueta equivocada con el lector equivocado no
 * va a pasar nada legible.
 *
 * `LOT` lleva el lote PRIMERO porque es lo que identifica al bulto físico: el
 * material se deduce del lote, nunca al revés.
 */
export function encodeLotQR(lotId: string): string {
	return `${WH_QR_PREFIX}LOT:${lotId}`;
}

export interface DecodedLot {
	ok: boolean;
	lotId: string | null;
	/** Qué mostrarle a quien escaneó algo que no sirve. */
	problem: string | null;
}

/**
 * Leer un QR escaneado.
 *
 * Tolerante a propósito: acepta el id pelado además del formato completo,
 * porque un lector de cámara a veces entrega la URL o el texto con espacios, y
 * fallar por eso frente a un operario con el pallet delante es la forma más
 * rápida de que deje de escanear.
 */
export function decodeLotQR(raw: string): DecodedLot {
	const texto = (raw ?? '').trim();
	if (!texto) return { ok: false, lotId: null, problem: 'No se leyó nada.' };

	// El formato del taller.
	if (texto.toUpperCase().startsWith(`${WH_QR_PREFIX}LOT:`)) {
		const id = texto.slice(WH_QR_PREFIX.length + 4).split(':')[0]?.trim();
		return esUUID(id)
			? { ok: true, lotId: id, problem: null }
			: { ok: false, lotId: null, problem: 'El código es de un lote pero está incompleto.' };
	}

	// Otra etiqueta del taller: es un QR válido, pero no de un lote.
	if (texto.toUpperCase().startsWith(WH_QR_PREFIX)) {
		return {
			ok: false,
			lotId: null,
			problem: 'Ese es un código de material o de máquina, no de un lote de papel.',
		};
	}

	// El id pelado, o una URL que lo termina conteniendo.
	const suelto = texto.split(/[/?#]/).pop()?.trim() ?? '';
	if (esUUID(suelto)) return { ok: true, lotId: suelto, problem: null };

	return { ok: false, lotId: null, problem: 'Ese código no es de este sistema.' };
}

/** El día, sin la hora. Un vencimiento vale hasta el final de su fecha. */
const aMedianoche = (d: Date): Date =>
	new Date(d.getFullYear(), d.getMonth(), d.getDate());

const esUUID = (v: string | undefined): v is string =>
	!!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/* ─── El número de lote ──────────────────────────────────────────────────── */

/** `L-2608-0001`. El correlativo lo da la base; esto sólo lo reconoce. */
export const LOT_NUMBER_RE = /^L-\d{4}-\d{4}$/;

/**
 * ¿Este número lo generamos nosotros?
 *
 * Importa porque el número del PROVEEDOR también es válido y se guarda tal
 * cual: es el que aparece en su certificado, y en un retiro es el que hay que
 * citar. Distinguirlos evita el error de buscar el nuestro en su documentación.
 */
export function esNumeroPropio(lotNumber: string | null | undefined): boolean {
	return !!lotNumber && LOT_NUMBER_RE.test(lotNumber.trim());
}

/* ─── Puede consumirse ───────────────────────────────────────────────────── */

export type BlockReason = 'retenido' | 'sin_certificado' | 'certificado_vencido' | 'sin_saldo';

export interface LotForUse {
	lotNumber: string;
	quantityAvailable: number;
	certificationCode?: string | null;
	certificationExpiresOn?: string | null;
	blockedReason?: string | null;
	/** Del ítem: si este material exige certificado. Única fuente. */
	requiresCert: boolean;
	/** De la política: días de margen exigidos al consumir. */
	minDaysValid?: number;
	/** Quién puede autorizar la desviación. */
	overrideRole?: string | null;
}

export interface UseCheck {
	/** Se puede sacar sin que nadie firme nada. */
	allowed: boolean;
	/** Se puede sacar, pero alguien tiene que autorizarlo por escrito. */
	needsOverride: boolean;
	reason: BlockReason | null;
	/** Para mostrarle al operario, en su idioma. */
	message: string | null;
}

/**
 * ¿Se puede sacar este lote para esta OT?
 *
 * La misma pregunta que hace `consumir_lote` en la base. Está en los dos lados
 * a propósito y no por duplicación: acá para que el operario lo vea ANTES de
 * cargar el papel a la máquina, y allá porque un control que sólo vive en la
 * pantalla se saltea con una llamada directa.
 */
export function checkLotUse(lot: LotForUse, quantity: number, today = new Date()): UseCheck {
	// Una retención es una decisión humana explícita y gana sobre todo cálculo.
	if (lot.blockedReason) {
		return {
			allowed: false,
			needsOverride: false,
			reason: 'retenido',
			message: `El lote ${lot.lotNumber} está retenido: ${lot.blockedReason}`,
		};
	}

	if (quantity > lot.quantityAvailable) {
		return {
			allowed: false,
			needsOverride: false,
			reason: 'sin_saldo',
			message: `Quedan ${lot.quantityAvailable.toLocaleString('es-CL')} y estás sacando ${quantity.toLocaleString('es-CL')}.`,
		};
	}

	if (!lot.requiresCert) {
		return { allowed: true, needsOverride: false, reason: null, message: null };
	}

	const quien = lot.overrideRole ?? 'Calidad';

	if (!lot.certificationExpiresOn) {
		return {
			allowed: false,
			needsOverride: true,
			reason: 'sin_certificado',
			message: `Este material exige certificado y el lote ${lot.lotNumber} no tiene. Necesita autorización de ${quien}.`,
		};
	}

	// Los dos extremos a medianoche antes de restar.
	//
	// Un vencimiento es una FECHA, no un instante. Comparar la medianoche del
	// vencimiento contra un `now` de media tarde corre la cuenta un día entero:
	// un certificado vencido hace 12 días decía 13, y uno que vence HOY se leía
	// como vencido ayer — que es la diferencia entre poder imprimir y no.
	const vence = aMedianoche(
		new Date(
			lot.certificationExpiresOn.length <= 10
				? `${lot.certificationExpiresOn}T00:00:00`
				: lot.certificationExpiresOn,
		),
	);
	const dias = Math.round((vence.getTime() - aMedianoche(today).getTime()) / 86_400_000);

	if (dias < (lot.minDaysValid ?? 0)) {
		return {
			allowed: false,
			needsOverride: true,
			reason: 'certificado_vencido',
			message:
				dias < 0
					? `El certificado del lote ${lot.lotNumber} venció hace ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'día' : 'días'}. Necesita autorización de ${quien}.`
					: `El certificado vence en ${dias} ${dias === 1 ? 'día' : 'días'} y la política pide ${lot.minDaysValid}. Necesita autorización de ${quien}.`,
		};
	}

	return { allowed: true, needsOverride: false, reason: null, message: null };
}

/* ─── El veredicto de la orden ───────────────────────────────────────────── */

export type Verdict = 'conforme' | 'con_desviacion_autorizada' | 'no_conforme' | 'sin_consumo';

export const VERDICT_LABELS: Record<Verdict, string> = {
	conforme: 'Conforme',
	con_desviacion_autorizada: 'Con desviación autorizada',
	no_conforme: 'No conforme',
	sin_consumo: 'Sin material consumido',
};

/**
 * Qué explicarle a quien pregunta.
 *
 * Un auditor no pide la lista de lotes: pregunta si la orden es conforme. La
 * respuesta tiene que ser una, y tiene que decir por qué — «no conforme» sin
 * motivo obliga a ir a buscar, que es exactamente el tiempo que no hay durante
 * un simulacro de retiro.
 */
export function verdictExplanation(v: {
	veredicto: Verdict;
	lotes_consumidos: number;
	lotes_sin_certificado: number;
	lotes_vencidos_al_usar: number;
	lotes_con_desviacion: number;
}): string {
	switch (v.veredicto) {
		case 'sin_consumo':
			return 'Todavía no se consumió material contra esta orden.';
		case 'conforme':
			return `${v.lotes_consumidos} ${v.lotes_consumidos === 1 ? 'lote' : 'lotes'} con certificado vigente al momento de usarse.`;
		case 'con_desviacion_autorizada':
			return `${v.lotes_con_desviacion} ${v.lotes_con_desviacion === 1 ? 'lote entró' : 'lotes entraron'} con autorización escrita. Queda registrado quién la dio.`;
		case 'no_conforme': {
			const partes: string[] = [];
			if (v.lotes_sin_certificado > 0) {
				partes.push(`${v.lotes_sin_certificado} sin certificado`);
			}
			if (v.lotes_vencidos_al_usar > 0) {
				partes.push(`${v.lotes_vencidos_al_usar} con el certificado vencido al usarse`);
			}
			return `${partes.join(' y ')}. Hay que documentar la desviación antes de despachar.`;
		}
	}
}

/** Los colores del veredicto. Semánticos, no decorativos. */
export const VERDICT_CLASS: Record<Verdict, string> = {
	conforme: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
	con_desviacion_autorizada: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
	no_conforme: 'bg-red-500/15 text-red-700 dark:text-red-400',
	sin_consumo: 'bg-muted text-muted-foreground',
};
