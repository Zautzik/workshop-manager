import { costPerKg, type SheetSpec } from '@/lib/paper-units';

/**
 * ¿Se puede creer este precio de material?
 *
 * El resolvedor de costeo tenía esta regla: «prefer the real purchase-weighted
 * cost when a matching material has lots». La intención es correcta —lo que
 * costó de verdad manda sobre el catálogo— pero hoy convive con dos problemas
 * que la vuelven peligrosa:
 *
 *   1. ESCALA. La misma cartulina vale $2.800/kg en `cost_catalog` y $3,20/kg
 *      en los lotes. Un trabajo cotizado con el segundo subestima el papel 875
 *      veces, y el papel es la partida más grande de una imprenta.
 *
 *   2. UNIDAD. Los materiales conviven en kg, resma y unidad, y todos entran al
 *      motor como `substrate_per_kg` sin conversión. «Papel Bond 75g» vale
 *      $12.500 la RESMA; cobrado como kilo, el error va 11 veces al otro lado.
 *
 * El mismo mecanismo produce errores por defecto y por exceso según qué fila
 * gane el emparejamiento por nombre. Esto no valida datos: decide si un precio
 * es utilizable, y cuando no lo es dice por qué en vez de devolverlo igual.
 */

/** Unidad en que se compra y se cotiza un material. */
export type MaterialUnit = 'kg' | 'resma' | 'pliego' | 'unit' | 'litro' | 'm2' | 'rollo' | 'click';

/**
 * Bandas de cordura por unidad, en pesos chilenos. No son precios: son los
 * límites fuera de los cuales un número no puede ser el precio de eso.
 *
 * El piso importa más que el techo — los errores encontrados fueron todos por
 * defecto, valores de uno o dos dígitos donde debía haber miles.
 */
export const SANE_RANGE: Partial<Record<MaterialUnit, { min: number; max: number }>> = {
	// Ningún sustrato de imprenta cuesta menos de $100 el kilo en Chile; el
	// couché fino ronda $1.800 y la cartulina $3.000.
	kg: { min: 100, max: 200_000 },
	// Una resma de bond bordea $12.000; una de couché grueso puede llegar a $60.000.
	resma: { min: 1_000, max: 300_000 },
	pliego: { min: 5, max: 5_000 },
	litro: { min: 500, max: 100_000 },
	rollo: { min: 500, max: 500_000 },
	m2: { min: 100, max: 100_000 },
};

export type PriceVerdict =
	/** Utilizable. */
	| 'ok'
	/** Fuera de la banda de cordura para su unidad: casi seguro un error de escala. */
	| 'fuera_de_escala'
	/** La unidad del lote no es la que el motor espera; usarlo mezcla peras con kilos. */
	| 'unidad_incompatible'
	/** No hay precio. */
	| 'sin_precio';

export interface PriceCheck {
	verdict: PriceVerdict;
	usable: boolean;
	/** En el idioma del taller, para que la pantalla pueda decirlo. */
	reason: string | null;
}

export interface PriceCandidate {
	value: number | null | undefined;
	unit: string | null | undefined;
	/**
	 * Geometría del pliego, cuando el material la tiene. Con ella una resma se
	 * traduce a kilos en vez de descartarse: es la diferencia entre «no puedo
	 * usar este precio» y «puedo, convertido».
	 */
	sheet?: SheetSpec | null;
}

/**
 * @param expected  La unidad que el motor va a tratar este precio como si fuera.
 */
export function checkMaterialPrice(candidate: PriceCandidate, expected: MaterialUnit): PriceCheck {
	const value = typeof candidate.value === 'number' && Number.isFinite(candidate.value) ? candidate.value : null;

	if (value === null || value <= 0) {
		return { verdict: 'sin_precio', usable: false, reason: 'No hay precio cargado.' };
	}

	const unit = (candidate.unit ?? '').trim().toLowerCase();
	if (unit && unit !== expected) {
		return {
			verdict: 'unidad_incompatible',
			usable: false,
			reason: `El precio está por ${unit} y el cálculo lo usaría por ${expected}. Falta la conversión.`,
		};
	}

	const range = SANE_RANGE[expected];
	if (range && (value < range.min || value > range.max)) {
		return {
			verdict: 'fuera_de_escala',
			usable: false,
			reason:
				value < range.min
					? `$${value} por ${expected} es demasiado bajo para ser un precio real (mínimo razonable $${range.min}). Probablemente esté en otra escala o en otra moneda.`
					: `$${value} por ${expected} excede lo razonable (máximo $${range.max}).`,
		};
	}

	return { verdict: 'ok', usable: true, reason: null };
}

/**
 * Elige entre el costo real y el de catálogo, con la regla corregida:
 * el real manda SÓLO si además es creíble. Si no, gana el catálogo y se dice
 * por qué — en vez de devolver en silencio un número mil veces equivocado.
 */
export interface PriceChoice {
	value: number | null;
	source: 'real' | 'catalogo' | 'ninguno';
	/** Presente cuando se descartó el costo real. La pantalla debe poder mostrarlo. */
	warning: string | null;
}

/**
 * Traduce un precio a la unidad esperada cuando la geometría lo permite.
 * Una resma de 70×100 a 80 g son 28 kilos: el precio por kilo se puede deducir,
 * no hace falta descartarlo.
 */
function convertir(c: PriceCandidate, expected: MaterialUnit): PriceCandidate {
	const unit = (c.unit ?? '').trim().toLowerCase();
	if (!c.sheet || unit === expected || typeof c.value !== 'number') return c;

	if (expected === 'kg' && (unit === 'resma' || unit === 'pliego')) {
		const perKg = costPerKg({ value: c.value, unit: unit as 'resma' | 'pliego' }, c.sheet);
		if (perKg !== null) return { ...c, value: perKg, unit: 'kg' };
	}
	return c;
}

export function chooseMaterialPrice(
	real: PriceCandidate | null | undefined,
	catalogo: PriceCandidate | null | undefined,
	expected: MaterialUnit,
): PriceChoice {
	const realConv = real ? convertir(real, expected) : null;
	const realCheck = realConv ? checkMaterialPrice(realConv, expected) : null;
	if (realCheck?.usable) {
		return { value: realConv!.value as number, source: 'real', warning: null };
	}

	const catConv = catalogo ? convertir(catalogo, expected) : null;
	const catCheck = catConv ? checkMaterialPrice(catConv, expected) : null;
	if (catCheck?.usable) {
		return {
			value: catConv!.value as number,
			source: 'catalogo',
			warning: realCheck ? `Se ignoró el costo real: ${realCheck.reason}` : null,
		};
	}

	return {
		value: null,
		source: 'ninguno',
		warning: realCheck?.reason ?? catCheck?.reason ?? 'No hay precio utilizable para este material.',
	};
}
