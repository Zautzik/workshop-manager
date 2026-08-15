/**
 * Pasarle al asistente lo que la cotización ya sabe.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * El diálogo del vendedor captura el nivel 1 —lo que se junta al teléfono— y el
 * asistente de ocho pasos captura todo. Son dos formularios sobre el mismo
 * trabajo, y hasta acá no se hablaban: quien empezaba a cotizar y descubría que
 * necesitaba la ficha entera tenía que cerrar, abrir el asistente y volver a
 * escribir los quince campos que acababa de llenar.
 *
 * Volver a escribir no es sólo lento: es donde los dos formularios empiezan a
 * discrepar. El que teclea dos veces, la segunda pone otra cosa.
 *
 * ── Por qué no reusa la llave de borrador del asistente ─────────────────────
 *
 * El asistente ya guarda `unified-ot-draft` y lo restaura con un aviso —«se
 * recuperó un borrador»— que sería mentira acá: el usuario no dejó nada a
 * medias, viene de otra pantalla a propósito. Un traspaso deliberado merece su
 * propia llave y su propio mensaje, y además no puede pisar el borrador que
 * alguien tenga en curso.
 */

import { EMPTY_FINISHES, type OTColorMode, type OTFinishes, type OTPriorityLevel, type OTSubstrateType } from '@/types/ot';
import type { WorkCategoryKey } from '@/types/work-category';

/** Dónde viaja. `sessionStorage`, no `localStorage`: es de este viaje, no del navegador. */
export const HANDOFF_KEY = 'cotizacion-a-asistente';

/** Lo que la cotización sabe, en sus propios términos. */
export interface QuoteHandoff {
	client_id: string;
	client_name: string;
	product_name: string;
	product_type: string;
	quantity: number;
	width_cm: number;
	height_cm: number;
	grammage_gsm: number;
	substrate_type: string;
	colors_front: number;
	colors_back: number;
	coverage: 'light' | 'medium' | 'heavy';
	finishes: Record<string, boolean>;
	deadline: string;
	priority_level: string;
	press_id: string;
	markup: number;
	/** Para poder decir de dónde viene y con qué precio se venía trabajando. */
	precio_estimado: number;
}

/**
 * Los colores del oficio son un modo, no un número.
 *
 * El diálogo del vendedor los pide como cantidad —«4»— porque es como se dicen
 * por teléfono; el asistente y el motor los quieren como modo. La traducción va
 * acá y no en la pantalla: si vive en un componente, el próximo formulario la
 * escribe de nuevo y se le olvida el pantone.
 */
export function colorModeFromCount(n: number): OTColorMode {
	if (n >= 5) return 'cmyk_pantone';
	if (n === 4) return 'cmyk';
	if (n === 3) return '3_color';
	if (n === 2) return '2_color';
	if (n === 1) return '1_color';
	return 'sin_impresion';
}

/** Categoría del asistente que corresponde al tipo de producto de la cotización. */
const CATEGORIA_POR_PRODUCTO: Record<string, WorkCategoryKey> = {
	etiqueta: 'etiqueta',
	caja_plegadiza: 'estuche',
	caja_display: 'caja_display',
	afiche: 'afiche',
	brochure: 'folleto',
	volante: 'volante',
	carpeta: 'carpeta',
	sobre: 'sobre',
};

/** Lo que el asistente entiende. Parcial: el resto lo completa el propio asistente. */
export interface HandoffForm {
	work_category: WorkCategoryKey | null;
	client_id: string;
	client_name: string;
	product_name: string;
	trabajo: string;
	product_type: string;
	quantity: number;
	deadline: string;
	priority_level: OTPriorityLevel;
	width_cm: number;
	height_cm: number;
	substrate_type: OTSubstrateType | '';
	grammage_gsm: number;
	color_front: OTColorMode;
	color_back: OTColorMode;
	ink_coverage: 'light' | 'medium' | 'heavy';
	finishes: OTFinishes;
}

/**
 * Traduce la cotización al formulario del asistente.
 *
 * Lo que NO traduce es tan importante como lo que sí: el precio y el markup se
 * quedan atrás a propósito. El asistente recalcula con el motor completo —con
 * montaje real, máquina asignada y operaciones revisadas— y arrastrar el precio
 * de la estimación haría que el número viejo se vea como si fuera el nuevo.
 */
export function toWizardForm(q: QuoteHandoff): HandoffForm {
	// Sólo las que la cotización encendió, y sólo las que el asistente conoce:
	// una clave inventada entraría al formulario y no la vería nadie.
	const finishes: OTFinishes = { ...EMPTY_FINISHES };
	for (const clave of Object.keys(EMPTY_FINISHES) as (keyof OTFinishes)[]) {
		if (q.finishes?.[clave]) finishes[clave] = true;
	}

	return {
		work_category: CATEGORIA_POR_PRODUCTO[q.product_type] ?? null,
		client_id: q.client_id ?? '',
		client_name: q.client_name ?? '',
		product_name: q.product_name ?? '',
		// El asistente llama «trabajo» al título de producción. Se siembra con el
		// nombre del producto en vez de dejarlo vacío: es lo que el vendedor puso.
		trabajo: q.product_name ?? '',
		product_type: q.product_type ?? '',
		quantity: q.quantity ?? 0,
		deadline: q.deadline ?? '',
		priority_level: (q.priority_level || 'normal') as OTPriorityLevel,
		width_cm: q.width_cm ?? 0,
		height_cm: q.height_cm ?? 0,
		substrate_type: (q.substrate_type ?? '') as OTSubstrateType | '',
		grammage_gsm: q.grammage_gsm ?? 0,
		color_front: colorModeFromCount(q.colors_front ?? 0),
		color_back: colorModeFromCount(q.colors_back ?? 0),
		ink_coverage: q.coverage ?? 'medium',
		finishes,
	};
}

/** Cuántos campos se traspasaron, para poder decirlo en el aviso. */
export function handoffSummary(q: QuoteHandoff): { campos: number; terminaciones: number } {
	const f = toWizardForm(q);
	const campos = [
		f.client_id, f.product_name, f.product_type, f.quantity, f.width_cm, f.height_cm,
		f.substrate_type, f.grammage_gsm, f.deadline, q.press_id,
	].filter((v) => v !== '' && v !== 0 && v != null).length;

	return {
		campos,
		terminaciones: Object.values(f.finishes).filter(Boolean).length,
	};
}

/* ─── El canal ───────────────────────────────────────────────── */

export function stashHandoff(q: QuoteHandoff): void {
	try {
		sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(q));
	} catch {
		/* Sin sessionStorage el traspaso no ocurre y el asistente abre vacío.
		   Es degradación aceptable: nada se pierde, hay que escribir de nuevo. */
	}
}

/** Lo lee Y lo borra: un traspaso sirve una vez. */
export function takeHandoff(): QuoteHandoff | null {
	try {
		const raw = sessionStorage.getItem(HANDOFF_KEY);
		if (!raw) return null;
		sessionStorage.removeItem(HANDOFF_KEY);
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === 'object' ? (parsed as QuoteHandoff) : null;
	} catch {
		return null;
	}
}
