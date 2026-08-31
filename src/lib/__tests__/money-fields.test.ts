import { describe, expect, it } from 'vitest';
import { canSeeMoney, OPERATION_MONEY_FIELDS, OT_MONEY_FIELDS, redactMoney } from '../money-fields';

describe('canSeeMoney', () => {
	it('lets admin, manager, supervisor and vendedor see money', () => {
		expect(canSeeMoney('admin')).toBe(true);
		expect(canSeeMoney('manager')).toBe(true);
		expect(canSeeMoney('supervisor')).toBe(true);
		expect(canSeeMoney('vendedor')).toBe(true);
	});

	it('does not let technician or hr_manager see money', () => {
		expect(canSeeMoney('technician')).toBe(false);
		expect(canSeeMoney('hr_manager')).toBe(false);
	});

	it('treats a missing role as no access', () => {
		expect(canSeeMoney(null)).toBe(false);
		expect(canSeeMoney(undefined)).toBe(false);
	});
});

describe('redactMoney', () => {
	const ot = {
		id: 'ot-1', ot_number: '41500', client_name: 'Acme', status: 'workshop',
		subtotal: 100000, margin_pct: 10, margin_amount: 10000, increment_pct: 10,
		increment_amount: 11000, commission_pct: 1, commission_amount: 1200,
		total_price: 122000, unit_price: 12.2,
	};

	it('passes every field through untouched for a role that can see money', () => {
		expect(redactMoney(ot, 'admin')).toEqual(ot);
	});

	it('nulls every OT money field for technician, keeping the rest intact', () => {
		const out = redactMoney(ot, 'technician');
		expect(out.id).toBe('ot-1');
		expect(out.ot_number).toBe('41500');
		expect(out.client_name).toBe('Acme');
		expect(out.status).toBe('workshop');
		for (const field of OT_MONEY_FIELDS) {
			expect(out[field]).toBeNull();
		}
	});

	it('does not mutate the original row', () => {
		const clone = { ...ot };
		redactMoney(clone, 'technician');
		expect(clone).toEqual(ot);
	});

	it('redacts every row in an array', () => {
		const rows = [ot, { ...ot, id: 'ot-2' }];
		const out = redactMoney(rows, 'technician');
		expect(out).toHaveLength(2);
		expect(out[0].total_price).toBeNull();
		expect(out[1].total_price).toBeNull();
		expect(out[1].id).toBe('ot-2');
	});

	it('respects a custom field list, e.g. ot_operations unit_cost/total_cost', () => {
		const op = { id: 'op-1', name: 'Impresión', quantity: 500, unit_cost: 4.2, total_cost: 2100 };
		const out = redactMoney(op, 'technician', OPERATION_MONEY_FIELDS);
		expect(out.name).toBe('Impresión');
		expect(out.quantity).toBe(500);
		expect(out.unit_cost).toBeNull();
		expect(out.total_cost).toBeNull();
	});

	it('leaves a field alone if it is not present on the row', () => {
		const partial = { id: 'ot-3', total_price: 5000 };
		const out = redactMoney(partial, 'technician');
		expect(out.total_price).toBeNull();
		expect('margin_amount' in out).toBe(false);
	});
});
