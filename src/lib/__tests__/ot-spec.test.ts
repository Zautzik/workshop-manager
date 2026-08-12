import { describe, expect, it } from 'vitest';

import {
	BAND_DRIVERS,
	DRIFT_TOLERANCE,
	missingFor,
	priceBand,
	quoteDrift,
	specLevel,
	type OTSpec,
} from '../ot-spec';

/** Lo que el vendedor junta al teléfono. */
const COTIZABLE: OTSpec = {
	clientId: 'c1', productName: 'Estuche', productType: 'caja_plegadiza',
	quantity: 200_000, widthCm: 20, heightCm: 30,
	substrateType: 'cartulina', grammageGsm: 300,
	colorFront: 'cmyk', colorBack: 'sin_impresion', inkCoverage: 'medium',
	finishes: { finish_troquelado: true },
	deadline: '2026-09-15', pressId: 'ryobi-1',
};

/** Lo que Pre-Prensa agrega antes de comprar un pliego. */
const PRODUCIBLE: OTSpec = {
	...COTIZABLE,
	substrateBrand: 'Cartulina Ártica', substrateSupplier: 'Papeles Bío Bío',
	impositionConfirmed: true, machineId: 'ryobi-1',
	artAttached: true, operationsReviewed: true,
};

describe('completa PARA ALGO, no completa a secas', () => {
	it('la ficha del vendedor alcanza el nivel 1 y no el 2', () => {
		expect(specLevel(COTIZABLE)).toBe(1);
		expect(missingFor(1, COTIZABLE)).toEqual([]);
		expect(missingFor(2, COTIZABLE).length).toBeGreaterThan(0);
	});

	it('con lo de Pre-Prensa alcanza el 2', () => {
		expect(specLevel(PRODUCIBLE)).toBe(2);
		expect(missingFor(2, PRODUCIBLE)).toEqual([]);
	});

	it('una ficha vacía no es ni cotizable', () => {
		expect(specLevel({})).toBe(0);
	});

	it('pedir el nivel 2 devuelve también lo que falte del 1', () => {
		// Una ficha no puede ser producible sin ser cotizable.
		const sinPrensa = { ...PRODUCIBLE, pressId: null };
		expect(missingFor(2, sinPrensa).map((g) => g.field)).toContain('pressId');
	});

	it('cada hueco dice POR QUÉ importa, no sólo qué falta', () => {
		// Pedir un dato sin explicar para qué parece burocracia, y el vendedor
		// aprende a saltárselo.
		for (const g of missingFor(2, {})) {
			expect(g.why.length).toBeGreaterThan(30);
			expect(g.label).toBeTruthy();
		}
	});

	it('la prensa se pide primero: es lo que más mueve el precio', () => {
		expect(missingFor(1, {})[0].field).toBe('pressId');
	});
});

describe('las respuestas que parecen huecos y no lo son', () => {
	it('«sin arte» es una respuesta, no un dato faltante', () => {
		const sinArte = { ...PRODUCIBLE, artAttached: false, sinArte: true };
		expect(missingFor(2, sinArte).map((g) => g.field)).not.toContain('artAttached');
	});

	it('pero no declarar nada sobre el arte sí es un hueco', () => {
		const mudo = { ...PRODUCIBLE, artAttached: false, sinArte: false };
		expect(missingFor(2, mudo).map((g) => g.field)).toContain('artAttached');
	});

	it('«ninguna terminación» es una respuesta', () => {
		expect(specLevel({ ...PRODUCIBLE, finishes: {} })).toBe(2);
	});

	it('cantidad cero no es cantidad', () => {
		expect(missingFor(1, { ...COTIZABLE, quantity: 0 }).map((g) => g.field)).toContain('quantity');
	});
});

describe('la banda de precio', () => {
	it('sin prensa la banda se abre hacia arriba, que es donde duele', () => {
		// Medido: 100.000 etiquetas de 9×12 dieron $976.811 sin prensa y
		// $1.426.613 con la Ryobi real. El dato que falta empuja el costo arriba,
		// nunca abajo, así que una banda simétrica prometería un ahorro inexistente.
		const b = priceBand({ ...COTIZABLE, pressId: null, operationsReviewed: true, impositionConfirmed: true, substrateBrand: 'x' }, 1_000_000);
		expect(b.high - 1_000_000).toBeGreaterThan(1_000_000 - b.low);
		expect(b.high).toBeGreaterThan(1_400_000);
	});

	it('con todo sabido el precio es firme y la banda desaparece', () => {
		const b = priceBand(PRODUCIBLE, 1_000_000);
		expect(b.firm).toBe(true);
		expect(b.low).toBe(1_000_000);
		expect(b.high).toBe(1_000_000);
		expect(b.note).toBeNull();
	});

	it('las incertidumbres se combinan en cuadratura, no sumándose', () => {
		// Sumarlas supondría que las cuatro se equivocan hacia el mismo lado a la
		// vez. Con los cuatro datos faltantes la suma daría 106% y la cuadratura
		// 57%: un rango que va del cero al doble no ayuda a nadie a vender.
		const suma = BAND_DRIVERS.reduce((s, d) => s + d.up, 0);
		const b = priceBand({}, 1_000_000);
		const ancho = (b.high - 1_000_000) / 1_000_000;
		expect(ancho).toBeLessThan(suma * 0.7);
		expect(ancho).toBeGreaterThan(0.4);
	});

	it('agregar la prensa angosta la banda', () => {
		const sin = priceBand({}, 1_000_000);
		const con = priceBand({ pressId: 'r1' }, 1_000_000);
		expect(con.high).toBeLessThan(sin.high);
	});

	it('la nota se puede leer por teléfono', () => {
		const b = priceBand({}, 1_000_000);
		expect(b.note).toContain('falta saber');
		expect(b.note).toContain('Pre-Prensa');
	});

	it('sin precio base no inventa una banda', () => {
		expect(priceBand({}, 0).high).toBe(0);
	});
});

describe('cotizado contra firme', () => {
	it('el caso medido: 46% arriba obliga a reconfirmar', () => {
		const d = quoteDrift({ quoted: 976_811, firm: 1_426_613 });
		expect(d.direction).toBe('sube');
		expect(d.pct!).toBeCloseTo(0.46, 2);
		expect(d.note).toContain('reconfirmar');
	});

	it('una diferencia bajo la tolerancia no molesta a nadie', () => {
		const d = quoteDrift({ quoted: 1_000_000, firm: 1_000_000 * (1 + DRIFT_TOLERANCE / 2) });
		expect(d.direction).toBe('igual');
		expect(d.note).toBeNull();
	});

	it('avisa cuando el firme cayó fuera de la banda prometida', () => {
		const d = quoteDrift({ quoted: 1_000_000, firm: 1_800_000, band: { low: 950_000, high: 1_570_000 } });
		expect(d.outsideBand).toBe(true);
		expect(d.note).toContain('fuera de la banda');
	});

	it('dentro de la banda no lo menciona, aunque haya subido', () => {
		const d = quoteDrift({ quoted: 1_000_000, firm: 1_300_000, band: { low: 950_000, high: 1_570_000 } });
		expect(d.outsideBand).toBe(false);
		expect(d.note).not.toContain('fuera de la banda');
	});

	it('sin uno de los dos precios no compara', () => {
		expect(quoteDrift({ quoted: null, firm: 1_000_000 }).direction).toBe('sin_datos');
		expect(quoteDrift({ quoted: 1_000_000, firm: 0 }).direction).toBe('sin_datos');
	});
});
