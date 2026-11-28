import { describe, expect, it } from 'vitest';

import { issuedByLot, planReturns, whyNotCancelable, type IssueTx } from '../ot-cancel';

// Couché 150 g en 70×100: 0,105 kg por pliego. Lote en kg, como en bodega.
const item = { name: 'Couché 150 g 70×100', unit: 'kg', sheet_width_cm: 70, sheet_height_cm: 100, grammage_gsm: 150 };
const tx = (over: Partial<IssueTx>): IssueTx => ({
	tx_type: 'consumption', lot_id: 'lote-1', item_id: 'papel', work_order_id: 'ot', quantity: 210, unit_cost: 900,
	reference_code: 'L-001', item, ...over,
});

describe('qué OT se puede cancelar', () => {
	it('una en producción, sí', () => {
		expect(whyNotCancelable({ status: 'offset_printing' })).toBeNull();
		expect(whyNotCancelable({ status: 'ready_for_delivery' })).toBeNull();
	});

	it('una que ya salió a entrega, no: eso se deshace anulando la guía', () => {
		expect(whyNotCancelable({ status: 'in_delivery' })).toContain('entrega');
		expect(whyNotCancelable({ status: 'completed' })).toContain('entrega');
	});

	it('una ya cancelada, tampoco', () => {
		expect(whyNotCancelable({ status: 'offset_printing', cancelled_at: '2026-11-16T10:00:00Z' })).toContain('ya está cancelada');
	});
});

describe('el papel que la OT tiene afuera', () => {
	it('lo que salió, en la unidad del lote y en pliegos', () => {
		const [lot] = issuedByLot([tx({})]);
		expect(lot).toMatchObject({ lotNumber: 'L-001', netQuantity: 210, netSheets: 2000, unitCost: 900 });
	});

	it('neto de lo que ya volvió', () => {
		const [lot] = issuedByLot([tx({}), tx({ tx_type: 'return_to_stock', quantity: 52.5 })]);
		expect(lot.netQuantity).toBe(157.5);
		expect(lot.netSheets).toBe(1500);
	});

	it('un lote que ya volvió entero no aparece', () => {
		expect(issuedByLot([tx({}), tx({ tx_type: 'return_to_stock' })])).toEqual([]);
	});

	it('cada lote por separado, con el costo promedio de lo que salió', () => {
		const lots = issuedByLot([tx({}), tx({ quantity: 105, unit_cost: 1200 }), tx({ lot_id: 'lote-2', reference_code: 'L-002', quantity: 105 })]);
		expect(lots).toHaveLength(2);
		expect(lots[0].netQuantity).toBe(315);
		expect(lots[0].unitCost).toBe(1000);
	});

	it('el papel de un fragmento que salió contra la dueña se acredita a la dueña', () => {
		const [lot] = issuedByLot([tx({ work_order_id: 'duena' })]);
		expect(lot.workOrderId).toBe('duena');
	});
});

describe('lo que vuelve lo dice quien cancela', () => {
	const issued = issuedByLot([tx({})]);

	it('salieron 2.000, 600 ya se cortaron: vuelven 1.400 y el resto queda como costo', () => {
		const [r] = planReturns(issued, [{ lotId: 'lote-1', sheets: 1400 }]);
		expect(r.quantity).toBe(147);
		expect(r.amount).toBe(132_300);
	});

	it('todos los pliegos = todo lo que salió, sin resto de redondeo', () => {
		const exacto = issuedByLot([tx({ quantity: 209.987 })]);
		const [r] = planReturns(exacto, [{ lotId: 'lote-1', sheets: exacto[0].netSheets as number }]);
		expect(r.quantity).toBe(209.987);
	});

	it('no puede volver más de lo que salió', () => {
		expect(() => planReturns(issued, [{ lotId: 'lote-1', sheets: 2001 }])).toThrow(/no pueden volver/);
	});

	it('ni de un lote del que la OT no sacó nada', () => {
		expect(() => planReturns(issued, [{ lotId: 'otro', sheets: 10 }])).toThrow(/no tiene papel afuera/);
	});

	it('cero pliegos no es una devolución', () => {
		expect(planReturns(issued, [{ lotId: 'lote-1', sheets: 0 }])).toEqual([]);
		expect(planReturns(issued, [])).toEqual([]);
	});

	it('un lote que no se puede pasar a pliegos se devuelve desde Bodega', () => {
		const rollo = issuedByLot([tx({ item: { name: 'Rollo', unit: 'metros' } })]);
		expect(() => planReturns(rollo, [{ lotId: 'lote-1', sheets: 10 }])).toThrow(/Bodega/);
	});
});
