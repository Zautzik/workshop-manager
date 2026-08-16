import { describe, expect, it } from 'vitest';

import {
	antiguedadLegible,
	familia,
	groupedCandidates,
	substitutionCandidates,
	type PaperNeed,
	type StockPaper,
} from '../paper-substitution';

const HOY = new Date('2026-08-16T12:00:00Z');
const haceDias = (n: number) => new Date(HOY.getTime() - n * 86_400_000).toISOString().slice(0, 10);

const papel = (extra: Partial<StockPaper> = {}): StockPaper => ({
	itemId: 'i1',
	itemName: 'Couche sheet 130gsm',
	grammageGsm: 130,
	sheetWidthCm: 70,
	sheetHeightCm: 100,
	lotId: 'l1',
	lotNumber: 'L-2605-0010',
	quantityAvailable: 5000,
	receivedDate: haceDias(90),
	...extra,
});

const necesita = (extra: Partial<PaperNeed> = {}): PaperNeed => ({
	substrateType: 'couche',
	grammageGsm: 120,
	sheetsNeeded: 3000,
	...extra,
});

describe('familia', () => {
	it('lee la familia del nombre', () => {
		expect(familia('Couche sheet 115gsm')).toBe('couche');
		expect(familia('Cartulina C1S 300gsm')).toBe('cartulina');
		expect(familia('Papel Bond 75g 70×100')).toBe('bond');
	});

	// «Couche adhesivo» es adhesivo, no couché: sustituir uno por otro sería
	// cambiar el producto entero.
	it('el adhesivo gana sobre el couché', () => {
		expect(familia('Couche adhesivo roll 80gsm')).toBe('adhesivo');
	});

	it('no se confunde con tildes ni mayúsculas', () => {
		expect(familia('Papel Couché 150g 70×100')).toBe('couche');
	});
});

describe('substitutionCandidates', () => {
	// El caso que motivó la funcionalidad.
	it('ofrece el 130 que lleva tres meses cuando se cotiza un 120', () => {
		const r = substitutionCandidates([papel()], necesita(), HOY);
		expect(r).toHaveLength(1);
		expect(r[0].grammageDelta).toBe(10);
		expect(r[0].direction).toBe('arriba');
		expect(r[0].fitsFully).toBe(true);
		expect(r[0].reasons.join(' ')).toContain('10 g más grueso');
		expect(r[0].reasons.join(' ')).toContain('hace 3 meses');
		expect(r[0].pitch).toContain('más grueso');
	});

	// Bajar también es legítimo: muchas piezas rinden igual y sale más barato.
	// Un taller que nunca lo propone deja plata sobre la mesa y papel parado.
	it('propone bajar el gramaje como una oferta de ahorro', () => {
		const liviano = papel({ itemName: 'Couche sheet 110gsm', grammageGsm: 110 });
		const r = substitutionCandidates([liviano], necesita({ productType: 'etiqueta' }), HOY);
		expect(r).toHaveLength(1);
		expect(r[0].direction).toBe('abajo');
		expect(r[0].grammageDelta).toBe(-10);
		expect(r[0].pitch).toContain('baja el costo del papel');
	});

	// Lo que decide si se puede bajar es el PRODUCTO, no el gramaje.
	it('una etiqueta se puede bajar sin consultar: va pegada', () => {
		const liviano = papel({ itemName: 'Couche sheet 110gsm', grammageGsm: 110 });
		const r = substitutionCandidates([liviano], necesita({ productType: 'etiqueta' }), HOY);
		expect(r[0].needsTechnicalOk).toBe(false);
		expect(r[0].reasons.join(' ')).toContain('el gramaje no hace la función');
	});

	it('un estuche que se arma solo necesita que lo firme producción', () => {
		const liviano = papel({ itemName: 'Couche sheet 110gsm', grammageGsm: 110 });
		const r = substitutionCandidates([liviano], necesita({ productType: 'caja_plegadiza' }), HOY);
		expect(r[0].needsTechnicalOk).toBe(true);
		expect(r[0].reasons.join(' ')).toContain('se sostiene solo');
		expect(r[0].pitch).toContain('confirmá con producción');
	});

	// El margen hacia abajo es más chico: pasarse cuesta una reimpresión.
	it('baja con menos margen del que sube', () => {
		// 120: hasta 150 arriba (25%), hasta 102 abajo (15%).
		expect(substitutionCandidates([papel({ grammageGsm: 150 })], necesita(), HOY)).toHaveLength(1);
		expect(substitutionCandidates([papel({ itemName: 'Couche sheet 105gsm', grammageGsm: 105 })], necesita(), HOY)).toHaveLength(1);
		expect(substitutionCandidates([papel({ itemName: 'Couche sheet 95gsm', grammageGsm: 95 })], necesita(), HOY)).toEqual([]);
	});

	// Entre dos iguales, la que hay que consultar no es la que uno propone
	// primero al teléfono.
	it('la bajada riesgosa queda por debajo de la subida segura', () => {
		const arriba = papel({ lotId: 'arriba', itemName: 'Couche sheet 130gsm', grammageGsm: 130 });
		const abajo = papel({ lotId: 'abajo', itemName: 'Couche sheet 110gsm', grammageGsm: 110 });
		const r = substitutionCandidates([abajo, arriba], necesita({ productType: 'caja_plegadiza' }), HOY);
		expect(r[0].stock.lotId).toBe('arriba');
	});

	it('tampoco propone uno tan grueso que sea otro producto', () => {
		// 120 admite hasta 150. Un 200 ya es otra cosa.
		expect(substitutionCandidates([papel({ grammageGsm: 200 })], necesita(), HOY)).toEqual([]);
		expect(substitutionCandidates([papel({ grammageGsm: 150 })], necesita(), HOY)).toHaveLength(1);
	});

	it('no cruza familias', () => {
		const cartulina = papel({ itemName: 'Cartulina C1S 300gsm', grammageGsm: 300 });
		expect(substitutionCandidates([cartulina], necesita({ grammageGsm: 280 }), HOY)).toEqual([]);
	});

	it('el mismo gramaje también se ofrece: es el mejor caso', () => {
		const igual = papel({ itemName: 'Couche sheet 120gsm', grammageGsm: 120 });
		const r = substitutionCandidates([igual], necesita(), HOY);
		expect(r[0].grammageDelta).toBe(0);
		expect(r[0].reasons[0]).toContain('exactamente el papel cotizado');
	});

	it('descarta lo que no tiene saldo', () => {
		expect(substitutionCandidates([papel({ quantityAvailable: 0 })], necesita(), HOY)).toEqual([]);
	});

	// Cubrir parte igual sirve: se completa comprando el resto.
	it('lo que alcanza a medias se ofrece diciendo cuánto cubre', () => {
		const r = substitutionCandidates([papel({ quantityAvailable: 1500 })], necesita(), HOY);
		expect(r[0].fitsFully).toBe(false);
		expect(r[0].coverage).toBe(0.5);
		expect(r[0].reasons.join(' ')).toContain('Cubre el 50%');
	});

	// El pliego tiene que poder dar la pieza.
	it('descarta el pliego que no alcanza para la medida', () => {
		const chico = papel({ sheetWidthCm: 50, sheetHeightCm: 65 });
		expect(substitutionCandidates([chico], necesita({ widthCm: 70, heightCm: 100 }), HOY)).toEqual([]);
	});

	it('acepta el pliego girado', () => {
		const r = substitutionCandidates([papel()], necesita({ widthCm: 100, heightCm: 70 }), HOY);
		expect(r).toHaveLength(1);
	});

	it('sin medidas conocidas no descarta', () => {
		const sinMedidas = papel({ sheetWidthCm: null, sheetHeightCm: null });
		expect(substitutionCandidates([sinMedidas], necesita({ widthCm: 70, heightCm: 100 }), HOY)).toHaveLength(1);
	});

	// El orden es por conveniencia de MOVERLO, no por calce perfecto: el papel
	// idéntico recién llegado se va a usar solo, el viejo no.
	it('prioriza lo viejo sobre el calce perfecto', () => {
		const nuevoExacto = papel({ lotId: 'nuevo', itemName: 'Couche sheet 120gsm', grammageGsm: 120, receivedDate: haceDias(2) });
		const viejoGrueso = papel({ lotId: 'viejo', receivedDate: haceDias(150) });
		const r = substitutionCandidates([nuevoExacto, viejoGrueso], necesita(), HOY);
		expect(r[0].stock.lotId).toBe('viejo');
	});

	it('un estante vacío no rompe nada', () => {
		expect(substitutionCandidates([], necesita(), HOY)).toEqual([]);
	});
});

describe('groupedCandidates', () => {
	// El vendedor elige PAPEL, no lotes. Cuatro filas del mismo couché son
	// ruido; qué lote sale se decide después, en bodega.
	it('junta los lotes del mismo material en una fila', () => {
		const r = groupedCandidates(
			[
				papel({ lotId: 'a', quantityAvailable: 1000, receivedDate: haceDias(10) }),
				papel({ lotId: 'b', quantityAvailable: 1200, receivedDate: haceDias(120) }),
				papel({ lotId: 'c', quantityAvailable: 900, receivedDate: haceDias(30) }),
			],
			necesita(),
			HOY,
		);
		expect(r).toHaveLength(1);
		expect(r[0].lotCount).toBe(3);
		expect(r[0].stock.quantityAvailable).toBe(3100);
	});

	// El más viejo representa al grupo: es el que hay que sacarse de encima y
	// el que da el argumento para ofrecerlo.
	it('el representante es el lote más viejo', () => {
		const r = groupedCandidates(
			[
				papel({ lotId: 'nuevo', receivedDate: haceDias(5) }),
				papel({ lotId: 'viejo', receivedDate: haceDias(150) }),
			],
			necesita(),
			HOY,
		);
		expect(r[0].stock.lotId).toBe('viejo');
		expect(r[0].ageDays).toBe(150);
	});

	// Un material que en un lote sólo cubría parte puede cubrir todo sumando.
	it('la cobertura se recalcula con el total, no con un lote', () => {
		const r = groupedCandidates(
			[
				papel({ lotId: 'a', quantityAvailable: 1500 }),
				papel({ lotId: 'b', quantityAvailable: 1500 }),
			],
			necesita({ sheetsNeeded: 3000 }),
			HOY,
		);
		expect(r[0].fitsFully).toBe(true);
		expect(r[0].reasons.join(' ')).toContain('Alcanza para todo');
	});

	it('materiales distintos siguen separados', () => {
		const r = groupedCandidates(
			[papel(), papel({ itemId: 'i2', itemName: 'Couche sheet 145gsm', grammageGsm: 145 })],
			necesita(),
			HOY,
		);
		expect(r).toHaveLength(2);
	});
});

describe('antiguedadLegible', () => {
	// «hace 3 meses» dice más que «hace 94 días» cuando el punto es que está parado.
	it('habla en la escala que importa', () => {
		expect(antiguedadLegible(1)).toBe('hace 1 día');
		expect(antiguedadLegible(10)).toBe('hace 10 días');
		expect(antiguedadLegible(28)).toBe('hace 4 semanas');
		expect(antiguedadLegible(94)).toBe('hace 3 meses');
	});
});
