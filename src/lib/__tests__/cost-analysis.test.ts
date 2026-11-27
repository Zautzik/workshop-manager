import { describe, expect, it } from 'vitest';
import { analyzeCosts } from '../cost-analysis';

/**
 * El análisis de costo compara presupuesto (operaciones de la OT) contra el
 * libro (ot_cost_lines actual), por categoría. Leía ot_real_costs, que ya nadie
 * escribe: lo real de hoy no aparecía (B7).
 */
describe('analyzeCosts', () => {
	const ops = [
		{ category: 'materiales', quantity: 1000, unit: 'pliegos', unit_cost: 140, total_cost: 140_000 },
		{ category: 'impresion', quantity: 2, unit: 'horas', unit_cost: 85_000, total_cost: 170_000 },
	];
	const libro = [
		{ category: 'material', quantity: 1000, unit: 'pliegos', total: 150_000, source: 'consumo', ref_type: 'inventory_tx' },
		{ category: 'machine', quantity: 2, unit: 'horas', total: 170_000, source: 'stage_pass', ref_type: 'stage_pass' },
		{ category: 'machine', quantity: 1.5, unit: 'horas', total: 27_000, source: 'stage_pass', ref_type: 'stage_pass' },
		{ category: 'outsourced', quantity: 1, unit: 'servicio', total: 85_000, source: 'correccion', ref_type: 'correccion' },
	];

	it('empareja por categoría: el papel cotizado contra el papel que salió del lote', () => {
		const a = analyzeCosts(ops, libro);
		const papel = a.line_items.find((i) => i.category === 'material')!;
		expect(papel.estimated_cost).toBe(140_000);
		expect(papel.actual_cost).toBe(150_000);
		expect(papel.deviation_pct).toBeCloseTo(7.14, 1);
	});

	it('suma todas las pasadas de máquina en su rubro', () => {
		const maquina = analyzeCosts(ops, libro).line_items.find((i) => i.category === 'machine')!;
		expect(maquina.actual_cost).toBe(197_000);
		expect(maquina.actual_qty).toBe(3.5);
	});

	it('lo no presupuestado aparece igual, y la corrección se distingue', () => {
		const a = analyzeCosts(ops, libro);
		const terc = a.line_items.find((i) => i.category === 'outsourced')!;
		expect(terc.estimated_cost).toBe(0);
		expect(terc.actual_cost).toBe(85_000);
		expect(terc.deviation_pct).toBeNull();
		expect(terc.workflow_steps).toEqual(['corrección']);
		expect(a.workflow_steps_reported).toEqual(['salida de bodega', 'pasada cerrada', 'corrección']);
		expect(a.summary.corrections_total).toBe(85_000);
		expect(a.summary.total_actual).toBe(432_000);
	});

	it('sin nada real todavía no hay desvío (pendiente, no −100 %)', () => {
		const a = analyzeCosts(ops, []);
		expect(a.summary.total_actual).toBe(0);
		expect(a.summary.overall_deviation_pct).toBeNull();
		expect(a.line_items.every((i) => i.deviation_pct === null)).toBe(true);
	});
});
