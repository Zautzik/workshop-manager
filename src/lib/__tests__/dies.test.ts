import { describe, expect, it } from 'vitest';

import { costPerUse, matchDie, shelfHealth, suggestDies, type Die } from '../dies';

const troquel = (extra: Partial<Die> = {}): Die => ({
	id: 't1', code: 'TR-104', name: 'Etiqueta 9×12',
	widthCm: 9, heightCm: 12, cavities: 4,
	exclusive: false, status: 'activo', timesUsed: 5,
	...extra,
});

describe('matchDie', () => {
	it('calza cuando la medida es la misma', () => {
		const m = matchDie(troquel(), { widthCm: 9, heightCm: 12 });
		expect(m.usable).toBe(true);
		expect(m.reasons).toContain('La medida calza.');
	});

	// El caso que haría comprar de nuevo algo que está en el estante.
	it('calza girado: 12×9 corta lo mismo que 9×12', () => {
		expect(matchDie(troquel(), { widthCm: 12, heightCm: 9 }).usable).toBe(true);
	});

	it('no calza por medio centímetro: un troquel corta UNA forma', () => {
		const m = matchDie(troquel(), { widthCm: 9.5, heightCm: 12 });
		expect(m.usable).toBe(false);
		expect(m.reasons[0]).toContain('el trabajo es 9.5×12');
	});

	it('tolera cómo se anotó la medida, no el calce', () => {
		expect(matchDie(troquel(), { widthCm: 9.1, heightCm: 12 }).usable).toBe(true);
	});

	it('un troquel dado de baja no sirve aunque mida igual', () => {
		const m = matchDie(troquel({ status: 'dado_de_baja' }), { widthCm: 9, heightCm: 12 });
		expect(m.usable).toBe(false);
	});

	// Sirve, pero hay que mirarlo antes de prometer una fecha.
	it('uno desgastado sigue siendo usable y lo advierte', () => {
		const m = matchDie(troquel({ status: 'desgastado' }), { widthCm: 9, heightCm: 12 });
		expect(m.usable).toBe(true);
		expect(m.reasons.join(' ')).toContain('desgastado');
	});

	it('el exclusivo de otro cliente no se toca', () => {
		const m = matchDie(troquel({ exclusive: true, clientId: 'acme' }), {
			widthCm: 9, heightCm: 12, clientId: 'otro',
		});
		expect(m.usable).toBe(false);
		expect(m.reasons.join(' ')).toContain('exclusivo de otro cliente');
	});

	it('el exclusivo del mismo cliente sí', () => {
		const m = matchDie(troquel({ exclusive: true, clientId: 'acme' }), {
			widthCm: 9, heightCm: 12, clientId: 'acme',
		});
		expect(m.usable).toBe(true);
	});

	it('sin medidas no inventa un calce', () => {
		const m = matchDie(troquel({ widthCm: null, heightCm: null }), { widthCm: 9, heightCm: 12 });
		expect(m.usable).toBe(false);
		expect(m.reasons[0]).toContain('Falta la medida');
	});
});

describe('suggestDies', () => {
	it('devuelve sólo los que sirven', () => {
		const estante = [
			troquel({ id: 'a', widthCm: 9, heightCm: 12 }),
			troquel({ id: 'b', widthCm: 20, heightCm: 30 }),
			troquel({ id: 'c', status: 'dado_de_baja' }),
		];
		expect(suggestDies(estante, { widthCm: 9, heightCm: 12 }).map((m) => m.die.id)).toEqual(['a']);
	});

	it('prioriza el del mismo cliente sobre uno genérico', () => {
		const estante = [
			troquel({ id: 'generico', timesUsed: 3 }),
			troquel({ id: 'delCliente', clientId: 'acme', timesUsed: 3 }),
		];
		const r = suggestDies(estante, { widthCm: 9, heightCm: 12, clientId: 'acme' });
		expect(r[0].die.id).toBe('delCliente');
	});

	it('entre dos iguales prefiere el más usado: el taller lo conoce', () => {
		const estante = [troquel({ id: 'nuevo', timesUsed: 0 }), troquel({ id: 'rodado', timesUsed: 18 })];
		expect(suggestDies(estante, { widthCm: 9, heightCm: 12 })[0].die.id).toBe('rodado');
	});

	it('un estante vacío no sugiere nada y no explota', () => {
		expect(suggestDies([], { widthCm: 9, heightCm: 12 })).toEqual([]);
	});
});

describe('costPerUse', () => {
	// El número que convierte una compra cara en una inversión amortizada.
	it('reparte la compra entre los usos', () => {
		expect(costPerUse(troquel({ acquisitionCost: 320_000, timesUsed: 20 }))).toBe(16_000);
	});

	it('uno sin usar todavía costó lo que costó, no infinito', () => {
		expect(costPerUse(troquel({ acquisitionCost: 320_000, timesUsed: 0 }))).toBe(320_000);
	});

	it('sin precio de compra no inventa un costo', () => {
		expect(costPerUse(troquel({ acquisitionCost: null }))).toBeNull();
	});
});

describe('shelfHealth', () => {
	it('cuenta lo invertido y lo que nunca se volvió a usar', () => {
		const s = shelfHealth([
			troquel({ id: '1', acquisitionCost: 300_000, timesUsed: 12 }),
			troquel({ id: '2', acquisitionCost: 320_000, timesUsed: 1 }),
			troquel({ id: '3', acquisitionCost: 280_000, timesUsed: 0, status: 'dado_de_baja' }),
		]);
		expect(s.total).toBe(3);
		expect(s.activos).toBe(2);
		expect(s.invertido).toBe(900_000);
		expect(s.usadosUnaVez).toBe(1);
		expect(s.nuncaUsados).toBe(1);
	});
});
