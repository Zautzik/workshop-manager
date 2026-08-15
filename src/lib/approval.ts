/**
 * El visto bueno, como evidencia.
 *
 * Un visto bueno existe para una sola cosa: trasladar la responsabilidad. Si el
 * cliente aprobó un texto con una errata, la reimpresión es suya. Ese valor
 * entero depende de poder demostrar QUÉ se aprobó, QUIÉN lo aprobó y CUÁNDO —
 * y hasta ahora la aplicación guardaba, como firmante, la palabra «Cliente».
 *
 * ── Quién responde ──────────────────────────────────────────────────────────
 *
 * El cliente no entra al sistema. Quien marca el trabajo como aprobado es el
 * VENDEDOR: él es el eslabón entre el cliente y el taller, y el responsable de
 * que lo que quede registrado sea exacto.
 *
 * Eso mueve la evidencia de lugar y conviene ser honesto sobre qué es. No es la
 * firma del cliente: es la declaración de un vendedor identificado, con su
 * reloj, diciendo por qué medio se lo confirmaron. Vale menos que una firma y
 * muchísimo más que la palabra «Cliente» — y, sobre todo, tiene un dueño.
 *
 * De ahí las dos reglas duras: no se puede marcar sin decir POR QUÉ MEDIO se
 * confirmó (un correo se puede ir a buscar; un «me dijo que sí» no), y el
 * nombre del contacto es opcional pero no puede ser relleno.
 */

/** Sí o no. Una sola decisión por vuelta: el taller confirmó que no existen
 *  aprobaciones separadas de color, contenido y estructura. */
export type Decision = 'approved' | 'rejected';

/** Por qué NO. Sólo se pide al rechazar: el sí es un sí y no necesita más. */
export type RejectReason = 'texto' | 'color' | 'estructura' | 'otro';

/** Contra qué se aprobó. Aprobar color en una pantalla no es aprobar color. */
export type ProofedOn = 'pdf' | 'prueba_fisica' | 'maqueta';

/** Por dónde llegó el sí. Lo que el vendedor sí sabe, y lo único recuperable
 *  después: un correo se busca, una llamada no deja nada. */
export type ConfirmedVia = 'correo' | 'whatsapp' | 'telefono' | 'presencial' | 'portal';

export interface ApprovalInput {
	decision: Decision;
	/** Cómo se lo confirmó el cliente al vendedor. Obligatorio. */
	confirmedVia?: ConfirmedVia | null;
	/** El contacto del cliente, si el vendedor lo sabe. Opcional a propósito:
	 *  obligarlo empuja a escribir cualquier cosa, y «cualquier cosa» fue
	 *  exactamente el problema que este módulo existe para arreglar. */
	approverName?: string | null;
	approverEmail?: string | null;
	approverRole?: string | null;
	proofedOn?: ProofedOn | null;
	rejectReason?: RejectReason | null;
	comments?: string | null;
	fileSha256?: string | null;
}

/** Una fila del registro, como vuelve de la base. */
export interface ApprovalRow {
	decision: Decision | null;
	round: number;
	approver_name?: string | null;
	confirmed_via?: ConfirmedVia | null;
	recorded_by_name?: string | null;
	decided_at?: string | null;
	reject_reason?: RejectReason | null;
	proofed_on?: ProofedOn | null;
	file_sha256?: string | null;
}

export interface ValidationError {
	field: keyof ApprovalInput;
	message: string;
}

/**
 * Nombres que no son nombres.
 *
 * `signed_by_name: 'Cliente'` es la línea que dejó sin valor todos los vistos
 * buenos anteriores. No alcanza con pedir el campo: hay que rechazar el relleno,
 * porque el camino de menor esfuerzo cuando un campo es obligatorio es escribir
 * cualquier cosa.
 */
export const PLACEHOLDER_NAMES: readonly string[] = [
	'cliente',
	'client',
	'el cliente',
	'n/a',
	'na',
	'-',
	'.',
	'x',
	'test',
	'prueba',
	'aprobado',
];

/** A quién le vuelve el trabajo cuando el cliente dice que no.
 *
 *  Es el único dato accionable de un rechazo: «no me gustó» no se puede
 *  despachar a nadie, «el texto está mal» vuelve a diseño y «el envase no arma»
 *  vuelve a troquelado. */
export const BOUNCES_TO: Record<RejectReason, string> = {
	texto: 'Diseño',
	color: 'Prensa',
	estructura: 'Troquelado',
	otro: 'Pre-Prensa',
};

export const CONFIRMED_VIA_LABELS: Record<ConfirmedVia, string> = {
	correo: 'Por correo',
	whatsapp: 'Por WhatsApp',
	telefono: 'Por teléfono',
	presencial: 'En persona',
	portal: 'Desde el enlace',
};

/** Los medios que dejan algo que se puede ir a buscar después. Un teléfono no
 *  deja nada, y por eso el formulario lo dice en vez de tratarlos como iguales. */
export const RECOVERABLE_VIA: readonly ConfirmedVia[] = ['correo', 'whatsapp', 'portal'];

export const PROOFED_ON_LABELS: Record<ProofedOn, string> = {
	pdf: 'PDF',
	prueba_fisica: 'Prueba física',
	maqueta: 'Maqueta',
};

export const REJECT_REASON_LABELS: Record<RejectReason, string> = {
	texto: 'El texto',
	color: 'El color',
	estructura: 'La estructura',
	otro: 'Otro motivo',
};

/**
 * Qué le falta a esta decisión para poder guardarse.
 *
 * Devuelve la lista entera, no el primer error: quien está aprobando merece ver
 * de una vez todo lo que le falta y no descubrirlo de a un campo por intento.
 */
export function validateApproval(input: ApprovalInput): ValidationError[] {
	const errores: ValidationError[] = [];
	const nombre = (input.approverName ?? '').trim();

	// Sin medio no hay registro: es lo único que después se puede ir a buscar.
	if (!input.confirmedVia) {
		errores.push({
			field: 'confirmedVia',
			message: 'Falta por dónde lo confirmó el cliente. Es lo que se puede ir a buscar si después se discute.',
		});
	}

	if (nombre.length > 0 && nombre.length < 3) {
		errores.push({ field: 'approverName', message: 'Ese nombre está incompleto.' });
	} else if (nombre.length > 0 && PLACEHOLDER_NAMES.includes(nombre.toLowerCase())) {
		errores.push({
			field: 'approverName',
			message: `«${nombre}» no identifica a nadie. Dejalo vacío antes que poner un relleno: un vacío dice «no se sabe» y un relleno miente.`,
		});
	}

	if (input.approverEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.approverEmail.trim())) {
		errores.push({ field: 'approverEmail', message: 'Ese correo no parece un correo.' });
	}

	if (input.decision === 'rejected' && !input.rejectReason) {
		errores.push({
			field: 'rejectReason',
			message: 'Un rechazo tiene que decir por qué: es lo que decide a quién le vuelve el trabajo.',
		});
	}

	// Contra qué se aprobó sólo importa cuando se aprueba. En un rechazo no hay
	// nada que sostener después.
	if (input.decision === 'approved' && !input.proofedOn) {
		errores.push({
			field: 'proofedOn',
			message: 'Falta contra qué se aprobó: no es lo mismo un PDF que una prueba física.',
		});
	}

	return errores;
}

/** Qué vuelta es esta. La primera es la 1, no la 0 — se habla con el cliente. */
export function nextRound(previas: readonly ApprovalRow[]): number {
	const maxima = previas.reduce((m, r) => Math.max(m, r.round ?? 0), 0);
	return maxima + 1;
}

export interface ApprovalState {
	/** ¿Hay un sí? Es lo que abre la compra de papel. */
	approved: boolean;
	/** La decisión vigente, o null si todavía no hay ninguna. */
	last: ApprovalRow | null;
	/** Cuántas vueltas se mandaron. Cada una cuesta plata. */
	rounds: number;
	/** Cuántas veces dijo que no. */
	rejections: number;
	/** A dónde volvió el trabajo la última vez que lo rechazaron. */
	bouncedTo: string | null;
}

/**
 * El estado del visto bueno de una OT, leído del registro entero.
 *
 * Se calcula sobre TODAS las filas y no sobre una bandera en la OT, porque la
 * historia es el punto: un trabajo aprobado a la tercera vuelta y otro aprobado
 * a la primera hoy se ven iguales, y no cuestan lo mismo.
 */
export function approvalState(rows: readonly ApprovalRow[]): ApprovalState {
	const decididas = rows
		.filter((r) => r.decision != null)
		.slice()
		.sort((a, b) => a.round - b.round);

	const last = decididas.length > 0 ? decididas[decididas.length - 1] : null;
	const rechazos = decididas.filter((r) => r.decision === 'rejected');

	return {
		// La ÚLTIMA manda. Un sí seguido de un cambio de opinión no deja aprobado
		// el trabajo, y un no viejo no bloquea una vuelta que sí se aprobó.
		approved: last?.decision === 'approved',
		last,
		rounds: rows.reduce((m, r) => Math.max(m, r.round ?? 0), 0),
		rejections: rechazos.length,
		bouncedTo:
			last?.decision === 'rejected' && last.reject_reason ? BOUNCES_TO[last.reject_reason] : null,
	};
}

/**
 * Lo que se le muestra a quien tiene que decidir si sigue.
 *
 * Una frase, no un objeto: va al lado del botón que compromete la plata.
 */
export function approvalSummary(state: ApprovalState): string {
	if (!state.last) {
		return state.rounds > 0
			? `Prueba enviada, esperando respuesta (vuelta ${state.rounds}).`
			: 'Todavía no se mandó la prueba.';
	}

	// «El cliente» y no un nombre inventado cuando el vendedor no lo anotó: la
	// frase tiene que poder decir «no se sabe» sin sonar a que sí se sabe.
	const quien = state.last.approver_name?.trim() || 'el cliente';
	const medio = state.last.confirmed_via ? ` ${CONFIRMED_VIA_LABELS[state.last.confirmed_via].toLowerCase()}` : '';

	if (state.last.decision === 'approved') {
		const contra = state.last.proofed_on ? ` contra ${PROOFED_ON_LABELS[state.last.proofed_on].toLowerCase()}` : '';
		const vueltas = state.rounds > 1 ? `, a la vuelta ${state.last.round}` : '';
		return `Aprobado por ${quien}${medio}${contra}${vueltas}.`;
	}

	return `Rechazado por ${quien}${medio}: ${
		state.last.reject_reason ? REJECT_REASON_LABELS[state.last.reject_reason].toLowerCase() : 'sin motivo'
	}. Vuelve a ${state.bouncedTo ?? 'Pre-Prensa'}.`;
}
