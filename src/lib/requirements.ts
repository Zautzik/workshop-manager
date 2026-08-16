/**
 * Lo que una OT necesita para poder producirse.
 *
 * La etapa se llamaba «Compra de Papel» y el modelo la tomaba literal: una OC,
 * un papel, una recepción. Pero cuando una orden aterriza en el taller necesita
 * varias cosas a la vez, y por caminos que no se parecen:
 *
 *   comprar     · papel, cajas, un pantone especial que llega en su tarro
 *   bodega      · papel que YA ESTÁ de un trabajo anterior y nunca se usó
 *   tercerizar  · polilaminado, que no es material sino un servicio
 *
 * El camino de bodega es el que faltaba y probablemente el más común. Forzarlo
 * a pasar por una compra es lo que hace que el taller registre una OC falsa
 * para poder avanzar — o, más probable, que no registre nada y la etapa se
 * marque a mano.
 *
 * ── Por qué se deducen y no se escriben ─────────────────────────────────────
 *
 * La ficha ya sabe casi todo: si lleva pantones, si lleva laminado, cuánto
 * papel. Pedirle a alguien que vuelva a listarlo es pedirle que transcriba, y
 * una transcripción es donde se pierden los pantones. Se propone la lista y se
 * corrige; no se parte de una hoja en blanco.
 */

export type ReqKind =
	| 'papel'
	| 'tinta_especial'
	| 'envase'
	| 'servicio'
	| 'insumo'
	| 'herramental'
	| 'otro';
export type ReqSource = 'comprar' | 'bodega' | 'tercerizar';
export type ReqStatus = 'pendiente' | 'en_curso' | 'resuelto' | 'no_aplica';

export interface Requirement {
	id?: string;
	kind: ReqKind;
	description: string;
	itemId?: string | null;
	quantity?: number | null;
	unit?: string | null;
	source: ReqSource;
	purchaseId?: string | null;
	lotId?: string | null;
	status: ReqStatus;
	notes?: string | null;
}

export const KIND_LABELS: Record<ReqKind, string> = {
	papel: 'Papel',
	tinta_especial: 'Tinta especial',
	envase: 'Envase y embalaje',
	servicio: 'Servicio externo',
	insumo: 'Insumo',
	herramental: 'Herramental',
	otro: 'Otro',
};

export const SOURCE_LABELS: Record<ReqSource, string> = {
	comprar: 'Comprar',
	bodega: 'Sacar de bodega',
	tercerizar: 'Tercerizar',
};

/** Qué hay que hacer, dicho como una acción y no como una categoría. */
export const SOURCE_ACTION: Record<ReqSource, string> = {
	comprar: 'Emitir la OC',
	bodega: 'Elegir el lote',
	tercerizar: 'Encargar el servicio',
};

export const STATUS_LABELS: Record<ReqStatus, string> = {
	pendiente: 'Pendiente',
	en_curso: 'En curso',
	resuelto: 'Resuelto',
	no_aplica: 'No aplica',
};

/** El material que entra al producto y por eso arrastra trazabilidad. */
export const KINDS_CON_TRAZABILIDAD: readonly ReqKind[] = ['papel', 'tinta_especial'];

/* ─── Lo que la ficha ya sabe ────────────────────────────────────────────── */

export interface OTShape {
	quantity?: number | null;
	substrateType?: string | null;
	grammageGsm?: number | null;
	/** Pantones nombrados, si los hay. */
	pantoneColors?: readonly string[] | null;
	colorFront?: string | null;
	colorBack?: string | null;
	finishes?: Record<string, boolean> | null;
	productType?: string | null;
	/** `existente` = ya se eligió del estante; `nuevo` = hay que mandarlo a hacer. */
	dieSource?: string | null;
	dieCode?: string | null;
	/** Pliegos calculados por el motor, si ya se corrió. */
	sheets?: number | null;
}

const lleva = (f: Record<string, boolean> | null | undefined, k: string): boolean =>
	!!f && (f[k] === true || f[`finish_${k}`] === true);

/**
 * La lista propuesta para una OT.
 *
 * Sale de lo que la ficha ya declaró. No inventa cantidades que no puede saber
 * —las cajas dependen de cómo se embale, y eso lo decide el taller— pero sí
 * nombra el requisito, que es lo que se olvida.
 *
 * Todo nace `comprar` salvo lo que evidentemente es un servicio. Es el valor
 * por defecto más seguro: proponer «bodega» sugeriría que hay stock, y decirle
 * a alguien que ya tiene el papel cuando no lo tiene es peor que hacerlo elegir.
 */
export function proposeRequirements(ot: OTShape): Requirement[] {
	const reqs: Requirement[] = [];

	// El papel, siempre. Es lo único que no puede faltar.
	const sustrato = [ot.substrateType, ot.grammageGsm ? `${ot.grammageGsm} g` : null]
		.filter(Boolean)
		.join(' ');
	reqs.push({
		kind: 'papel',
		description: sustrato || 'Papel del trabajo',
		quantity: ot.sheets ?? null,
		unit: 'pliego',
		source: 'comprar',
		status: 'pendiente',
	});

	// Cada pantone es un tarro distinto que se pide aparte y llega cuando llega.
	// Agruparlos en «tintas» es cómo se termina esperando uno que nadie pidió.
	for (const p of ot.pantoneColors ?? []) {
		reqs.push({
			kind: 'tinta_especial',
			description: `Pantone ${p}`,
			source: 'comprar',
			status: 'pendiente',
		});
	}

	// Un modo de color que menciona pantone sin nombrar cuál: el hueco se
	// declara igual, porque saber que falta un dato es mejor que no saberlo.
	const mencionaPantone = [ot.colorFront, ot.colorBack].some((c) => c?.includes('pantone'));
	if (mencionaPantone && (ot.pantoneColors ?? []).length === 0) {
		reqs.push({
			kind: 'tinta_especial',
			description: 'Pantone sin especificar — falta el código',
			source: 'comprar',
			status: 'pendiente',
		});
	}

	// ── El troquel ──────────────────────────────────────────────────────────
	//
	// Es lo que más plazo agrega y lo que más fácil se olvida: un troquel nuevo
	// son ~$320.000 y dos semanas. Que el estante exista no sirve de nada si la
	// etapa que consigue las cosas no sabe que hace falta conseguirlo.
	//
	// Si Pre-Prensa ya eligió uno del estante, nace RESUELTO: no hay nada que
	// hacer, y mostrarlo pendiente sería ruido que enseña a ignorar la lista.
	if (lleva(ot.finishes, 'troquelado')) {
		const yaElegido = ot.dieSource === 'existente' && !!ot.dieCode;
		reqs.push({
			kind: 'herramental',
			description: yaElegido ? `Troquel ${ot.dieCode}` : 'Troquel — hay que definirlo',
			source: yaElegido ? 'bodega' : 'comprar',
			status: yaElegido ? 'resuelto' : 'pendiente',
			notes: yaElegido ? null : 'Si no hay uno en el estante que sirva, son ~2 semanas.',
		});
	}

	// Los servicios externos. Nacen `tercerizar` porque el taller no los hace.
	if (lleva(ot.finishes, 'laminado')) {
		reqs.push({
			kind: 'servicio',
			description: 'Polilaminado',
			source: 'tercerizar',
			status: 'pendiente',
		});
	}
	if (lleva(ot.finishes, 'hot_stamping')) {
		reqs.push({
			kind: 'servicio',
			description: 'Hot stamping',
			source: 'tercerizar',
			status: 'pendiente',
		});
	}

	// El embalaje del despacho. La cantidad depende de cómo se embale y eso lo
	// decide el taller, así que se nombra sin inventarla.
	reqs.push({
		kind: 'envase',
		description: 'Cajas para despacho',
		source: 'comprar',
		status: 'pendiente',
	});

	return reqs;
}

/* ─── El estado de la etapa ──────────────────────────────────────────────── */

export interface StageState {
	total: number;
	resueltos: number;
	pendientes: number;
	porComprar: number;
	porSacar: number;
	porTercerizar: number;
	/** Si la OT puede pasar a producción. */
	completo: boolean;
	/** Nada cargado todavía: no es «listo», es «no se sabe». */
	sinCargar: boolean;
}

export function stageState(reqs: readonly Requirement[]): StageState {
	const activos = reqs.filter((r) => r.status !== 'no_aplica');
	const pendientes = activos.filter((r) => r.status !== 'resuelto');

	return {
		total: activos.length,
		resueltos: activos.length - pendientes.length,
		pendientes: pendientes.length,
		porComprar: pendientes.filter((r) => r.source === 'comprar').length,
		porSacar: pendientes.filter((r) => r.source === 'bodega').length,
		porTercerizar: pendientes.filter((r) => r.source === 'tercerizar').length,
		completo: activos.length > 0 && pendientes.length === 0,
		sinCargar: activos.length === 0,
	};
}

/**
 * Una frase para el encabezado.
 *
 * «3 pendientes» obliga a abrir para saber de qué tipo. Decir «falta comprar 2
 * y sacar 1 de bodega» separa dos trabajos que hacen personas distintas.
 */
export function stageSummary(s: StageState): string {
	if (s.sinCargar) return 'Todavía no se cargó qué necesita esta orden.';
	if (s.completo) return `Todo conseguido: ${s.total} ${s.total === 1 ? 'requisito' : 'requisitos'}.`;

	const partes: string[] = [];
	if (s.porComprar > 0) partes.push(`comprar ${s.porComprar}`);
	if (s.porSacar > 0) partes.push(`sacar ${s.porSacar} de bodega`);
	if (s.porTercerizar > 0) partes.push(`encargar ${s.porTercerizar}`);

	return `Falta ${partes.join(', ')}.`;
}

/**
 * ¿Qué le falta a este requisito para poder marcarse resuelto?
 *
 * Devuelve el motivo o `null`. Es la misma regla que el `CHECK` de la base, y
 * está acá para poder decirlo antes de que el servidor rechace.
 */
export function whyNotResolved(r: Requirement): string | null {
	if (r.status === 'resuelto') return null;

	switch (r.source) {
		case 'comprar':
			return r.purchaseId ? null : 'Falta la orden de compra.';
		case 'bodega':
			// Sacar de bodega no lleva compra: lo que lo cierra es señalar el lote,
			// que además es lo que forma la trazabilidad hacia atrás.
			return r.lotId ? null : 'Falta indicar de qué lote sale.';
		case 'tercerizar':
			// Un servicio puede cerrarse sin documento: a veces es una llamada. Se
			// permite a propósito — exigir una OC para un polilaminado de $40.000
			// termina con la etapa marcada a mano y sin registro de nada.
			return null;
	}
}
