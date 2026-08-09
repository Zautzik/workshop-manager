/**
 * Merma: el papel que entró a la máquina y no salió vendible.
 *
 * Es el costo controlable más grande del offset. Un pliego arruinado ya se
 * compró, ya se imprimió y ya ocupó máquina: se paga tres veces y no se cobra
 * ninguna. Por eso el jefe de taller mira este número antes que el margen —
 * el margen dice que algo salió mal, la merma dice dónde.
 *
 * La tasa se calcula sobre el papel ENTRADO, no sobre el vendible:
 *
 *     merma % = merma ÷ (buenos + merma)
 *
 * Dividir por los buenos daría más de 100% cuando un trabajo se pierde entero,
 * que es precisamente el caso que hay que poder representar.
 */

/**
 * Bandas de la industria para offset de pliego. No son metas de esta imprenta
 * sino el rango en que se mueve el oficio: el arreglo consume pliegos antes de
 * que la primera hoja salga en registro, y ese costo fijo pesa muchísimo más en
 * un tiraje corto que en uno largo.
 *
 * Por eso la banda se juzga CONTRA EL TIRAJE: 8% en 500 pliegos es normal —son
 * cuarenta hojas de arreglo— y 8% en 100.000 es una máquina con un problema.
 */
export const MERMA_BANDS = {
	/** Tirajes cortos: el arreglo domina. */
	corto: { hasta: 2_000, normal: 0.10, alto: 0.18 },
	medio: { hasta: 20_000, normal: 0.05, alto: 0.10 },
	/** Tirajes largos: el arreglo se diluye y la merma debería ser mínima. */
	largo: { hasta: Infinity, normal: 0.025, alto: 0.05 },
} as const;

export type MermaLevel = 'sin_datos' | 'normal' | 'alta' | 'critica';

export interface MermaInput {
	/** Pliegos vendibles. */
	buenos?: number | null;
	/** Pliegos perdidos. */
	merma?: number | null;
	/** Total entrado, si se conoce directamente. */
	pliegos?: number | null;
}

export interface MermaVerdict {
	level: MermaLevel;
	/** 0–1. `null` cuando no se puede afirmar. */
	rate: number | null;
	/** Pliegos perdidos y entrados, ya reconciliados. */
	wasted: number;
	entered: number;
	/** El tramo de tiraje contra el que se juzgó. */
	band: keyof typeof MERMA_BANDS | null;
	/** En el idioma del taller. */
	note: string | null;
}

const num = (v: number | null | undefined): number =>
	typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;

export function bandFor(entered: number): keyof typeof MERMA_BANDS {
	if (entered <= MERMA_BANDS.corto.hasta) return 'corto';
	if (entered <= MERMA_BANDS.medio.hasta) return 'medio';
	return 'largo';
}

export function evaluateMerma(input: MermaInput): MermaVerdict {
	const wasted = num(input.merma);

	// `pliegos` puede venir como total entrado o como buenos, según lo que haya
	// escrito el operario. Se toma el mayor de las dos reconstrucciones posibles:
	// nunca puede entrar menos papel del que salió bueno más el que se perdió.
	const buenos = num(input.buenos);
	const declarados = num(input.pliegos);
	const entered = Math.max(declarados, buenos + wasted);

	if (entered <= 0) {
		return {
			level: 'sin_datos', rate: null, wasted, entered: 0, band: null,
			note: 'No se reportaron pliegos: no hay contra qué medir la merma.',
		};
	}

	const rate = wasted / entered;
	const band = bandFor(entered);
	const limits = MERMA_BANDS[band];

	const level: MermaLevel =
		rate > limits.alto ? 'critica' : rate > limits.normal ? 'alta' : 'normal';

	const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
	const note =
		level === 'normal'
			? null
			: level === 'alta'
				? `${pct(rate)} en un tiraje de ${entered.toLocaleString('es-CL')} pliegos. Para ese tamaño lo esperable es hasta ${pct(limits.normal)}.`
				: `${pct(rate)} en un tiraje de ${entered.toLocaleString('es-CL')} pliegos — más del doble de lo tolerable (${pct(limits.alto)}). Vale revisar la máquina o el arreglo.`;

	return { level, rate, wasted, entered, band, note };
}

/** Agregado: la merma de un conjunto se pondera por papel, no promediando tasas. */
export function aggregateMerma(rows: readonly MermaInput[]): MermaVerdict {
	if (rows.length === 0) {
		return { level: 'sin_datos', rate: null, wasted: 0, entered: 0, band: null, note: null };
	}

	// Promediar porcentajes daría el mismo peso a un tiraje de 500 y a uno de
	// 100.000. Se suman los pliegos y se divide una sola vez.
	let wasted = 0;
	let entered = 0;
	for (const r of rows) {
		const v = evaluateMerma(r);
		wasted += v.wasted;
		entered += v.entered;
	}

	return evaluateMerma({ merma: wasted, pliegos: entered });
}
