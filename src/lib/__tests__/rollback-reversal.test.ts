import { describe, expect, it } from 'vitest';

import { rollupCosts, type CostLine } from '../cost-rollup';
import {
	arrivedAt,
	birthPassOf,
	consumptionsUndoneBy,
	passesUndoneBy,
	stageStillInUse,
	type StockTx,
} from '../rollback-reversal';

describe('qué pasadas deja sin valor un retroceso', () => {
	const pasadas = [
		{ id: 'p-corte', workflow_step: 'guillotine_first_cut' },
		{ id: 'p-offset', workflow_step: 'offset_printing' },
		{ id: 'p-troquel', workflow_step: 'die_cutting' },
	];

	it('las de la etapa a la que vuelve y todas las posteriores', () => {
		// De corte final vuelve a offset: no dejó offset ni el troquel.
		expect(passesUndoneBy(pasadas, 'offset_printing').map((p) => p.id)).toEqual(['p-offset', 'p-troquel']);
	});

	it('las anteriores se quedan: esas etapas sí se dejaron', () => {
		expect(passesUndoneBy(pasadas, 'die_cutting').map((p) => p.id)).toEqual(['p-troquel']);
	});

	it('volver a Pre-Prensa las deshace todas', () => {
		expect(passesUndoneBy(pasadas, 'pre_press')).toHaveLength(3);
	});

	it('un retroceso entre etapas de salida no toca producción', () => {
		expect(passesUndoneBy(pasadas, 'ready_for_delivery')).toEqual([]);
	});

	it('sólo lo escrito desde que la OT llegó ahí: un reproceso anterior se trabajó y se queda', () => {
		// Imprimió (10:00), volvió a offset por reproceso (11:00), imprimió otra vez
		// (12:00) y ahora la devuelven porque la adelantaron de más.
		const historial = [
			{ to_status: 'offset_printing', created_at: '2026-11-10T09:00:00Z' },
			{ to_status: 'die_cutting', created_at: '2026-11-10T10:00:00Z' },
			{ to_status: 'offset_printing', created_at: '2026-11-10T11:00:00Z' },
			{ to_status: 'die_cutting', created_at: '2026-11-10T12:00:00Z' },
		];
		const dos = [
			{ id: 'primera', workflow_step: 'offset_printing', created_at: '2026-11-10T10:00:00Z' },
			{ id: 'segunda', workflow_step: 'offset_printing', created_at: '2026-11-10T12:00:00Z' },
		];
		const desde = arrivedAt(historial, 'offset_printing');
		expect(desde).toBe('2026-11-10T11:00:00Z');
		expect(passesUndoneBy(dos, 'offset_printing', desde).map((p) => p.id)).toEqual(['segunda']);
	});

	it('si la OT nunca llegó a esa etapa por un movimiento registrado, cuenta todo', () => {
		expect(arrivedAt([{ to_status: 'visto_bueno', created_at: '2026-11-10T09:00:00Z' }], 'pre_press')).toBeNull();
	});

	it('una pasada con una etapa que no existe no se toca', () => {
		expect(passesUndoneBy([{ id: 'x', workflow_step: 'etapa_vieja' }], 'pre_press')).toEqual([]);
	});
});

describe('la pasada con la que nació un fragmento', () => {
	const delPadre = [
		{ id: 'p1', workflow_step: 'offset_printing', units_moved: 400, created_at: '2026-11-10T14:00:05Z' },
		{ id: 'p2', workflow_step: 'offset_printing', units_moved: 600, created_at: '2026-11-11T09:00:00Z' },
		{ id: 'p3', workflow_step: 'guillotine_first_cut', units_moved: 400, created_at: '2026-11-10T14:00:05Z' },
	];
	const nacio = { fromStatus: 'offset_printing', units: 400, at: '2026-11-10T14:00:06Z' };

	it('se reconoce por etapa, unidades y momento', () => {
		expect(birthPassOf(delPadre, nacio)?.id).toBe('p1');
	});

	it('si el fragmento cambió de tamaño ya no calza, y no se adivina', () => {
		expect(birthPassOf(delPadre, { ...nacio, units: 250 })).toBeNull();
	});

	it('dos candidatas iguales tampoco se adivinan', () => {
		const dobles = [...delPadre, { ...delPadre[0], id: 'p1-bis' }];
		expect(birthPassOf(dobles, nacio)).toBeNull();
	});
});

describe('qué material vuelve a bodega', () => {
	const tx = (over: Partial<StockTx> & { id: string }): StockTx => ({
		tx_type: 'consumption', lot_id: 'lote-1', item_id: 'papel', quantity: 120.5, unit_cost: 900,
		reference_code: 'L-001', notes: 'guillotine_first_cut', created_at: '2026-11-10T10:00:00Z', ...over,
	});

	it('lo que salió para entrar a una etapa posterior a la que vuelve', () => {
		const r = consumptionsUndoneBy([tx({ id: 'a' })], 'in_storage');
		expect(r.toReturn.map((t) => t.id)).toEqual(['a']);
	});

	it('si vuelve a la misma etapa de entrada, el papel se queda: la OT sigue adentro', () => {
		expect(consumptionsUndoneBy([tx({ id: 'a' })], 'guillotine_first_cut').toReturn).toEqual([]);
	});

	it('nunca dos veces: lo ya devuelto no vuelve a devolverse', () => {
		const r = consumptionsUndoneBy(
			[tx({ id: 'a' }), tx({ id: 'dev', tx_type: 'return_to_stock', notes: 'Retroceso…', created_at: '2026-11-10T11:00:00Z' })],
			'in_storage',
		);
		expect(r.toReturn).toEqual([]);
	});

	it('retrocedió, volvió a entrar y retrocede otra vez: vuelve sólo la segunda salida', () => {
		const r = consumptionsUndoneBy(
			[
				tx({ id: 'primera' }),
				tx({ id: 'dev', tx_type: 'return_to_stock', notes: 'Retroceso…', created_at: '2026-11-10T11:00:00Z' }),
				tx({ id: 'segunda', created_at: '2026-11-10T12:00:00Z' }),
			],
			'in_storage',
		);
		expect(r.toReturn).toHaveLength(1);
	});

	it('un escaneo sin etapa reconocible no se toca', () => {
		expect(consumptionsUndoneBy([tx({ id: 'a', notes: 'consumo' })], 'pre_press').toReturn).toEqual([]);
	});

	it('una devolución parcial hecha a mano vuelve ambiguo el lote: se avisa en vez de adivinar', () => {
		const r = consumptionsUndoneBy(
			[tx({ id: 'a' }), tx({ id: 'parcial', tx_type: 'return_to_stock', quantity: 20, notes: 'sobró' })],
			'in_storage',
		);
		expect(r.toReturn).toEqual([]);
		expect(r.ambiguous.map((t) => t.id)).toEqual(['a']);
	});

	it('cada lote se mira por separado', () => {
		const r = consumptionsUndoneBy(
			[tx({ id: 'a' }), tx({ id: 'b', lot_id: 'lote-2' }), tx({ id: 'dev-b', lot_id: 'lote-2', tx_type: 'return_to_stock', notes: 'x' })],
			'in_storage',
		);
		expect(r.toReturn.map((t) => t.id)).toEqual(['a']);
	});
});

describe('el papel de un trabajo partido es de todo el grupo', () => {
	const grupo = [
		{ id: 'a', status: 'pre_press' },
		{ id: 'b', status: 'in_storage' },
		{ id: 'c', status: 'offset_printing' },
	];

	it('si otro fragmento sigue en máquina, el papel no vuelve', () => {
		expect(stageStillInUse(grupo, 'b', 'guillotine_first_cut')).toBe(true);
	});

	it('si el que retrocede era el único adentro, sí', () => {
		expect(stageStillInUse(grupo, 'c', 'guillotine_first_cut')).toBe(false);
	});
});

describe('un costo real que neta cero no hace confiable al margen', () => {
	const ingreso = [{ ot_id: 'ot', ot_number: '41000', client_name: 'Cliente', revenue: 1_000_000 }];
	const linea = (total: number): CostLine => ({ ot_id: 'ot', kind: 'actual', category: 'material', total, source: 'inventory_tx' });

	it('salida y devolución suman cero: el margen no es 100%, es desconocido', () => {
		const [r] = rollupCosts([linea(250_000), linea(-250_000)], ingreso);
		expect(r.actual_cost).toBe(0);
		expect(r.unreliable).toBe(true);
		expect(r.provenance.label).toContain('se revirtió por completo');
	});

	it('si queda costo real después del retroceso, el margen sigue valiendo', () => {
		const [r] = rollupCosts([linea(250_000), linea(-250_000), linea(180_000)], ingreso);
		expect(r.actual_cost).toBe(180_000);
		expect(r.unreliable).toBe(false);
	});
});
