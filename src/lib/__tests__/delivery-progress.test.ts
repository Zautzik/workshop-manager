import { describe, expect, it } from 'vitest';

import { deliveryProgress, indexByOt } from '../delivery-progress';

describe('deliveryProgress', () => {
	it('sin fila de fulfillment devuelve sin_datos', () => {
		expect(deliveryProgress(null).stage).toBe('sin_datos');
		expect(deliveryProgress(undefined).stage).toBe('sin_datos');
	});

	it('nada despachado es en_proceso, no parcial', () => {
		// La 40502 real: 150.000 pedidas, ninguna guía todavía.
		const p = deliveryProgress({ ordered_qty: 150000, dispatched_qty: 0, guide_count: 0 });
		expect(p.stage).toBe('en_proceso');
		expect(p.delivered).toBe(0);
		expect(p.inProcess).toBe(150000);
		expect(p.pct).toBe(0);
	});

	it('todo despachado es completo', () => {
		// La 40503 real: 80.000 pedidas, una guía por 80.000.
		const p = deliveryProgress({ ordered_qty: 80000, dispatched_qty: 80000, guide_count: 1 });
		expect(p.stage).toBe('completo');
		expect(p.inProcess).toBe(0);
		expect(p.pct).toBe(100);
	});

	it('entrega parcial reparte entre entregado y en proceso', () => {
		const p = deliveryProgress({ ordered_qty: 150000, dispatched_qty: 60000, guide_count: 2 });
		expect(p.stage).toBe('parcial');
		expect(p.delivered).toBe(60000);
		expect(p.inProcess).toBe(90000);
		expect(p.pct).toBe(40);
		expect(p.guides).toBe(2);
	});

	it('entregado + en proceso siempre suma lo pedido', () => {
		for (const delivered of [0, 1, 37419, 149999, 150000]) {
			const p = deliveryProgress({ ordered_qty: 150000, dispatched_qty: delivered, guide_count: 1 });
			expect(p.delivered + p.inProcess).toBe(150000);
		}
	});

	it('despachar de más se marca en vez de esconderse', () => {
		const p = deliveryProgress({ ordered_qty: 1000, dispatched_qty: 1200, guide_count: 3 });
		expect(p.stage).toBe('excedido');
		// El porcentaje se recorta para que la barra no se salga del riel…
		expect(p.pct).toBe(100);
		// …pero la cifra real se conserva, que es la que delata el problema.
		expect(p.delivered).toBe(1200);
		expect(p.inProcess).toBe(0);
	});

	it('cantidad pedida en cero no produce NaN ni Infinity', () => {
		const p = deliveryProgress({ ordered_qty: 0, dispatched_qty: 500, guide_count: 1 });
		expect(p.stage).toBe('sin_datos');
		expect(Number.isFinite(p.pct)).toBe(true);
		expect(p.pct).toBe(0);
	});

	it('nulos se tratan como cero, no como NaN', () => {
		const p = deliveryProgress({ ordered_qty: null, dispatched_qty: null, guide_count: null });
		expect(p.stage).toBe('sin_datos');
		expect(p.ordered).toBe(0);
		expect(Number.isNaN(p.pct)).toBe(false);
	});

	it('cantidades negativas se saneen a cero', () => {
		const p = deliveryProgress({ ordered_qty: 1000, dispatched_qty: -50, guide_count: -1 });
		expect(p.delivered).toBe(0);
		expect(p.guides).toBe(0);
		expect(p.inProcess).toBe(1000);
		expect(p.stage).toBe('en_proceso');
	});

	it('redondea el porcentaje en vez de truncarlo', () => {
		// 2/3 = 66,67% → 67, no 66.
		const p = deliveryProgress({ ordered_qty: 3, dispatched_qty: 2, guide_count: 1 });
		expect(p.pct).toBe(67);
	});

	it('una guía parcial mínima no se redondea hasta desaparecer del estado', () => {
		const p = deliveryProgress({ ordered_qty: 150000, dispatched_qty: 1, guide_count: 1 });
		// El porcentaje redondea a 0, pero el estado NO puede ser "en_proceso":
		// algo salió y el cliente lo tiene.
		expect(p.pct).toBe(0);
		expect(p.stage).toBe('parcial');
	});
});

describe('indexByOt', () => {
	it('indexa por ot_id', () => {
		const map = indexByOt([
			{ ot_id: 'a', ordered_qty: 1 },
			{ ot_id: 'b', ordered_qty: 2 },
		]);
		expect(map.get('a')?.ordered_qty).toBe(1);
		expect(map.get('b')?.ordered_qty).toBe(2);
		expect(map.get('c')).toBeUndefined();
	});

	it('devuelve un mapa vacío para una lista vacía', () => {
		expect(indexByOt([]).size).toBe(0);
	});
});
