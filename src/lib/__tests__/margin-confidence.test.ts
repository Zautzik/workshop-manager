import { describe, expect, it } from 'vitest';

import { aggregateMarginConfidence, marginConfidence } from '../margin-confidence';

describe('marginConfidence', () => {
	it('el caso que motivó todo: ingreso sin costo NO es 100%', () => {
		// La 40502 real, tal como está hoy en producción.
		const v = marginConfidence({ revenue: 6263040.3, actual_cost: 0 });
		expect(v.confidence).toBe('sin_costo');
		expect(v.pct).toBeNull();
		expect(v.amount).toBeNull();
		expect(v.label).toBe('Sin costo');
		expect(v.hint).toContain('desconocido');
	});

	it('con costo real afirma el margen', () => {
		const v = marginConfidence({ revenue: 1000, actual_cost: 700 });
		expect(v.confidence).toBe('medido');
		expect(v.amount).toBe(300);
		expect(v.pct).toBe(30);
	});

	it('distingue «sólo estimado» de «sin costo»', () => {
		// Tiene estimación pero nadie cargó lo que costó: son estados distintos y
		// el dueño necesita saber cuál está mirando.
		const v = marginConfidence({ revenue: 1000, actual_cost: 0, estimated_cost: 800 });
		expect(v.confidence).toBe('estimado');
		expect(v.pct).toBeNull();
	});

	it('margen negativo se afirma igual — perder plata es un dato medido', () => {
		const v = marginConfidence({ revenue: 1000, actual_cost: 1300 });
		expect(v.confidence).toBe('medido');
		expect(v.amount).toBe(-300);
		expect(v.pct).toBe(-30);
	});

	it('costo sin ingreso no divide por cero', () => {
		const v = marginConfidence({ revenue: 0, actual_cost: 500 });
		expect(v.confidence).toBe('medido');
		expect(v.amount).toBe(-500);
		expect(v.pct).toBeNull();
		expect(Number.isFinite(v.amount!)).toBe(true);
	});

	it('sin nada devuelve sin_datos, no cero', () => {
		expect(marginConfidence({ revenue: 0, actual_cost: 0 }).confidence).toBe('sin_datos');
		expect(marginConfidence({ revenue: null, actual_cost: undefined }).confidence).toBe('sin_datos');
	});

	it('nunca devuelve un porcentaje sin costo real detrás', () => {
		// La invariante que impide que vuelva a aparecer un 100% en verde.
		for (const revenue of [1, 1000, 6263040.3, 1e9]) {
			expect(marginConfidence({ revenue, actual_cost: 0 }).pct).toBeNull();
			expect(marginConfidence({ revenue, actual_cost: 0, estimated_cost: 5 }).pct).toBeNull();
		}
	});
});

describe('aggregateMarginConfidence', () => {
	it('las dos OT reales de hoy: el total tampoco afirma', () => {
		const v = aggregateMarginConfidence([
			{ revenue: 6263040.3, actual_cost: 0 },
			{ revenue: 3349998.3, actual_cost: 0 },
		]);
		expect(v.confidence).toBe('sin_costo');
		expect(v.pct).toBeNull();
	});

	it('avisa cuando el total está inflado por las que no tienen costo', () => {
		const v = aggregateMarginConfidence([
			{ revenue: 1000, actual_cost: 700 },
			{ revenue: 1000, actual_cost: 0 },
		]);
		expect(v.confidence).toBe('estimado');
		expect(v.label).toBe('Parcial');
		expect(v.hint).toContain('1 de 2');
		// El monto se muestra, pero marcado: 1300 parece margen y no lo es.
		expect(v.amount).toBe(1300);
	});

	it('con todas costeadas afirma el total', () => {
		const v = aggregateMarginConfidence([
			{ revenue: 1000, actual_cost: 700 },
			{ revenue: 2000, actual_cost: 1000 },
		]);
		expect(v.confidence).toBe('medido');
		expect(v.amount).toBe(1300);
		expect(v.pct).toBe(43);
	});

	it('lista vacía no revienta', () => {
		expect(aggregateMarginConfidence([]).confidence).toBe('sin_datos');
	});
});
