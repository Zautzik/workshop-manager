/**
 * Una foto de bodega, sin una sola letra escrita.
 *
 * El código de la etiqueta dice QUÉ pallet es. Lo que no dice —y lo que hace
 * falta para descontarlo— es PARA QUÉ OT sale y CUÁNTO. Pedirle eso por texto
 * al que está con guantes al lado del pallet devuelve el problema al principio:
 * si hay que escribir, no se hace.
 *
 * Pero casi siempre el sistema ya lo sabe. Alguien reservó ese lote para esa
 * OT, o Compras lo dejó anotado como el papel de ese trabajo, o hay una sola OT
 * esperando papel en bodega. Este módulo es la escalera que consulta lo que ya
 * está escrito, de lo más explícito a lo más inferido, y se detiene en el primer
 * peldaño que da una respuesta sin ambigüedad.
 *
 * ── Preguntar es el último peldaño, no el primero ───────────────────────────
 *
 * Cuando ninguna fuente resuelve, no se adivina: se contesta con la lista de OT
 * candidatas y se espera un número. Responder «40502» son cinco dígitos, no un
 * UUID — sigue siendo, en la práctica, no escribir.
 *
 * Adivinar sería peor que preguntar. Descontar el pallet contra la OT
 * equivocada rompe justamente lo que el escaneo viene a construir: en un retiro,
 * la trazabilidad apuntaría con total seguridad al lote que no es.
 *
 * Puro, sin I/O: recibe lo que la base ya dijo y decide. Buscarlo es de la ruta.
 */

/** Una reserva viva de este lote. */
export interface Reserva {
	ot_id: string;
	ot_number: string | null;
	quantity: number | null;
}

/** Un requisito de compras que apunta a este lote. */
export interface Requisito {
	ot_id: string;
	ot_number: string | null;
	quantity: number | null;
	status: string;
}

/** Una OT parada en bodega esperando papel. */
export interface OTEsperando {
	id: string;
	ot_number: string;
	/** Pliegos que el motor calculó para el trabajo entero. */
	calc_sheets?: number | null;
}

export interface EntradaFoto {
	/** Lote identificado a partir del código. */
	lotId: string;
	lotNumber?: string | null;
	/** Saldo del lote, para no proponer más de lo que hay. */
	available?: number | null;
	/** La OT que venía escrita en el propio código, si la etiqueta la traía. */
	otNumberFromLabel?: string | null;
	reservas?: readonly Reserva[];
	requisitos?: readonly Requisito[];
	esperando?: readonly OTEsperando[];
}

export type FuenteOT = 'etiqueta' | 'reserva' | 'requisito' | 'unica_esperando';

export interface ResolucionFoto {
	lotId: string;
	otId: string | null;
	otNumber: string | null;
	/** Pliegos a descontar. `null` cuando no se puede afirmar. */
	quantity: number | null;
	/** De dónde salió la OT. Va en la respuesta para que se pueda desmentir. */
	source: FuenteOT | null;
	/** Qué preguntar cuando no alcanza para decidir. */
	question: string | null;
	/** OT entre las que hay que elegir, cuando se pregunta. */
	candidates: { id: string; ot_number: string }[];
}

const cantidad = (v: number | null | undefined): number | null =>
	typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

/** El requisito sigue pendiente: lo resuelto ya no espera nada. */
const pendiente = (r: Requisito) => r.status !== 'resuelto' && r.status !== 'no_aplica';

/**
 * Para qué OT sale este pallet, y cuánto.
 *
 * El orden de la escalera es el orden de la certeza:
 *
 *   1. La etiqueta lo dice. Alguien imprimió ese código PARA ese trabajo.
 *   2. Hay una reserva viva. Alguien comprometió este papel con esa OT y el
 *      sistema viene defendiendo esa promesa contra otras órdenes.
 *   3. Un requisito de compras apunta a este lote. Compras lo consiguió para
 *      ese trabajo.
 *   4. Hay una sola OT esperando papel en bodega. Es inferencia, pero cuando
 *      hay una sola no hay nada que elegir.
 *
 * En cuanto un peldaño devuelve DOS respuestas, se pregunta. Dos reservas vivas
 * sobre el mismo pallet es exactamente el caso donde adivinar sale caro.
 */
export function resolveWarehousePhoto(input: EntradaFoto): ResolucionFoto {
	const base = {
		lotId: input.lotId,
		otId: null as string | null,
		otNumber: null as string | null,
		quantity: null as number | null,
		source: null as FuenteOT | null,
		question: null as string | null,
		candidates: [] as { id: string; ot_number: string }[],
	};

	const tope = (n: number | null): number | null => {
		if (n == null) return null;
		const disponible = cantidad(input.available);
		return disponible != null ? Math.min(n, disponible) : n;
	};

	// 1 · La etiqueta trae la OT escrita.
	const deEtiqueta = input.otNumberFromLabel?.trim();
	if (deEtiqueta) {
		const match =
			(input.reservas ?? []).find((r) => r.ot_number === deEtiqueta) ??
			(input.requisitos ?? []).find((r) => r.ot_number === deEtiqueta);
		const esperando = (input.esperando ?? []).find((o) => o.ot_number === deEtiqueta);
		const otId = match?.ot_id ?? esperando?.id ?? null;
		if (otId) {
			return {
				...base,
				otId,
				otNumber: deEtiqueta,
				quantity: tope(cantidad(match?.quantity) ?? cantidad(esperando?.calc_sheets)),
				source: 'etiqueta',
			};
		}
		// La etiqueta nombra una OT que no aparece por ningún lado. No se
		// inventa: puede ser una etiqueta vieja reusada, que es justo el error
		// que hay que atrapar.
	}

	// 2 · Una reserva viva.
	const reservas = input.reservas ?? [];
	if (reservas.length === 1) {
		return {
			...base,
			otId: reservas[0].ot_id,
			otNumber: reservas[0].ot_number,
			quantity: tope(cantidad(reservas[0].quantity)),
			source: 'reserva',
		};
	}
	if (reservas.length > 1) {
		return {
			...base,
			question: `Ese pallet está reservado para ${reservas.length} órdenes. ¿Para cuál sale?`,
			candidates: reservas
				.filter((r) => r.ot_number)
				.map((r) => ({ id: r.ot_id, ot_number: r.ot_number! })),
		};
	}

	// 3 · Un requisito de compras que apunta a este lote.
	const requisitos = (input.requisitos ?? []).filter(pendiente);
	if (requisitos.length === 1) {
		return {
			...base,
			otId: requisitos[0].ot_id,
			otNumber: requisitos[0].ot_number,
			quantity: tope(cantidad(requisitos[0].quantity)),
			source: 'requisito',
		};
	}
	if (requisitos.length > 1) {
		return {
			...base,
			question: `Ese material figura en ${requisitos.length} órdenes. ¿Para cuál sale?`,
			candidates: requisitos
				.filter((r) => r.ot_number)
				.map((r) => ({ id: r.ot_id, ot_number: r.ot_number! })),
		};
	}

	// 4 · Una sola OT esperando papel.
	const esperando = input.esperando ?? [];
	if (esperando.length === 1) {
		return {
			...base,
			otId: esperando[0].id,
			otNumber: esperando[0].ot_number,
			quantity: tope(cantidad(esperando[0].calc_sheets)),
			source: 'unica_esperando',
		};
	}
	if (esperando.length > 1) {
		return {
			...base,
			question: 'Hay varias órdenes esperando papel. ¿Para cuál sale este pallet?',
			// Se ofrecen las primeras: una lista de treinta números no es una
			// pregunta, es un formulario.
			candidates: esperando.slice(0, 6).map((o) => ({ id: o.id, ot_number: o.ot_number })),
		};
	}

	return {
		...base,
		question:
			'Leí la etiqueta, pero no hay ninguna orden esperando este papel. ' +
			'¿Para qué OT sale? Respondé con el número.',
	};
}

/**
 * Lo que se le contesta al que mandó la foto. Corto: lo lee de pie.
 *
 * Ninguna foto descuenta sola — bodega o un supervisor la confirma después
 * (ver `PATCH /api/captures/[id]`), así que esto nunca dice «descontando»:
 * diría que ya pasó cuando todavía está pendiente. Hay tres respuestas
 * posibles, no dos — «pregunto», «sé todo, falta confirmar» y «sé la OT pero
 * no cuánto» son estados distintos y cada uno necesita su propia frase.
 */
export function replyForResolution(r: ResolucionFoto, lotNumber?: string | null): string {
	const lote = lotNumber ? `Lote ${lotNumber}` : 'Lote leído';

	if (r.question) {
		const lista = r.candidates.map((c) => c.ot_number).join(' · ');
		return lista ? `${lote}. ${r.question}\n${lista}` : `${lote}. ${r.question}`;
	}

	const porque = {
		etiqueta: 'lo dice la etiqueta',
		reserva: 'estaba reservado',
		requisito: 'Compras lo pidió para esa OT',
		unica_esperando: 'es la única esperando papel',
	}[r.source ?? 'etiqueta'];

	// Se sabe para qué OT es, pero no cuánto (p. ej. la OT todavía no tiene
	// los pliegos calculados). No hay nada que confirmar todavía — hace falta
	// el número antes de que esto pueda aprobarse.
	if (r.quantity == null) {
		return `${lote} → OT ${r.otNumber} (${porque}), pero no sé cuánto. Decime la cantidad antes de que se pueda confirmar.`;
	}

	return `${lote} → OT ${r.otNumber} (${porque}): ${r.quantity.toLocaleString('es-CL')} pliegos. Queda pendiente de confirmar antes de descontarlo.`;
}
