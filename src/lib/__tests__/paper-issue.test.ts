import { describe, expect, it } from 'vitest';
import { paperEntryStatus, pendingSheets, perSheet, quantityToSheets, sheetsToQuantity } from '@/lib/paper-issue';
import { deriveRoute, type PlanStepKey } from '@/lib/production-route';
import { passMachineCandidates, stageMachineTypes } from '@/lib/stage-machine';

const route = (...keys: PlanStepKey[]) => keys.map((key) => ({ key }));

describe('paperEntryStatus — el papel sale al entrar a la primera etapa de la ruta', () => {
	it('con primer corte, sale al entrar a la guillotina', () => {
		expect(paperEntryStatus(route('corte_inicial', 'offset', 'troquelado', 'embalaje', 'despacho'))).toBe('guillotine_first_cut');
	});

	it('una digital sin primer corte sale al entrar a la digital', () => {
		expect(paperEntryStatus(route('digital', 'corte_final', 'embalaje', 'despacho'))).toBe('digital_printing');
	});

	it('papel que llega a medida directo a la prensa sale al entrar a la prensa', () => {
		expect(paperEntryStatus(route('offset', 'corte_final', 'embalaje'))).toBe('offset_printing');
	});

	it('una ruta sin etapas de pliego no saca papel', () => {
		expect(paperEntryStatus(route('embalaje', 'despacho'))).toBeNull();
	});
});

describe('perSheet — de pliegos a la unidad del lote', () => {
	it('kg: área del pliego × gramaje', () => {
		// 70×100 cm = 0,7 m² × 90 g/m² = 63 g por pliego.
		expect(perSheet({ unit: 'kg', sheet_width_cm: 70, sheet_height_cm: 100, grammage_gsm: 90 })).toBeCloseTo(0.063, 6);
	});

	it('kg sin medidas: el peso por pliego que supuso la OT', () => {
		expect(perSheet({ unit: 'kg' }, { calcKg: 126, calcSheets: 2000 })).toBeCloseTo(0.063, 6);
	});

	it('kg sin medidas ni cálculo: no se inventa', () => {
		expect(perSheet({ unit: 'kg' })).toBeNull();
	});

	it('resma: 500 pliegos si no dice otra cosa', () => {
		expect(perSheet({ unit: 'resma' })).toBe(1 / 500);
		expect(perSheet({ unit: 'resma', sheets_per_package: 250 })).toBe(1 / 250);
	});

	it('pliegos o unidades: uno a uno; un rollo no se convierte', () => {
		expect(perSheet({ unit: 'unit' })).toBe(1);
		expect(perSheet({ unit: 'pliego' })).toBe(1);
		expect(perSheet({ unit: 'rollo' })).toBeNull();
	});

	it('ida y vuelta', () => {
		const f = 0.063;
		expect(sheetsToQuantity(2000, f)).toBe(126);
		expect(quantityToSheets(126, f)).toBe(2000);
	});
});

describe('pendingSheets — cuánto sale, sin pasar lo que falta', () => {
	it('el trabajo entero, de una vez', () => {
		expect(pendingSheets({ calcSheets: 2000, makeReadySheets: 200, movedUnits: 10000, groupUnits: 10000, issuedSheets: 0 }).sheets).toBe(2000);
	});

	it('el primer fragmento se lleva el arreglo entero', () => {
		// Mitad del tiraje (900) + los 200 del arreglo.
		expect(pendingSheets({ calcSheets: 2000, makeReadySheets: 200, movedUnits: 5000, groupUnits: 10000, issuedSheets: 0 }).sheets).toBe(1100);
	});

	it('el segundo fragmento no vuelve a arreglar', () => {
		expect(pendingSheets({ calcSheets: 2000, makeReadySheets: 200, movedUnits: 5000, groupUnits: 10000, issuedSheets: 1100 }).sheets).toBe(900);
	});

	it('si ya salió todo (vuelta atrás y adelante), no sale de nuevo', () => {
		const r = pendingSheets({ calcSheets: 2000, movedUnits: 10000, groupUnits: 10000, issuedSheets: 2000 });
		expect(r.sheets).toBe(0);
		expect(r.note).toMatch(/ya salió/);
	});

	it('nunca más de lo que queda', () => {
		expect(pendingSheets({ calcSheets: 2000, movedUnits: 10000, groupUnits: 10000, issuedSheets: 1500 }).sheets).toBe(500);
	});
});

describe('deriveRoute con ruta declarada', () => {
	const ot = {
		id: 'x',
		status: 'in_storage',
		quantity: 10000,
		calc_sheets: 2000,
		color_front: 'cmyk',
		color_back: 'sin_impresion',
		finish_troquelado: true,
	};

	it('sin ruta declarada deduce de la ficha, como antes', () => {
		expect(deriveRoute(ot).map((s) => s.key)).toContain('corte_inicial');
	});

	it('la ruta declarada manda: sin primer corte no hay primer corte', () => {
		const keys = deriveRoute({ ...ot, route_steps: ['offset', 'troquelado', 'desglose', 'embalaje', 'despacho'] }).map((s) => s.key);
		expect(keys).toEqual(['offset', 'troquelado', 'desglose', 'embalaje', 'despacho']);
	});

	it('una etapa declarada que la ficha no deducía toma su estimación', () => {
		const steps = deriveRoute({ ...ot, route_steps: ['corte_inicial', 'digital', 'tercerizado', 'despacho'] });
		expect(steps.map((s) => s.key)).toEqual(['corte_inicial', 'digital', 'tercerizado', 'despacho']);
		expect(steps.every((s) => s.quoteHours >= 0)).toBe(true);
		expect(steps.find((s) => s.key === 'tercerizado')?.source).toBe('supuesto');
	});

	it('el orden es el del flujo, venga como venga, y se ignoran claves desconocidas', () => {
		const keys = deriveRoute({ ...ot, route_steps: ['despacho', 'nada', 'offset'] }).map((s) => s.key);
		expect(keys).toEqual(['offset', 'despacho']);
	});
});

describe('passMachineCandidates — la máquina de la etapa, no la prensa asignada', () => {
	const machines = [
		{ id: 'prensa', type: 'offset_printer' },
		{ id: 'g1', type: 'guillotine' },
		{ id: 'g2', type: 'guillotine' },
		{ id: 'g3', type: 'guillotine', is_active: false },
		{ id: 'troquel', type: 'die_cutter' },
	];

	it('la asignada, si hace la etapa', () => {
		expect(passMachineCandidates({ workflowStep: 'offset_printing', assignedMachineId: 'prensa', machines })).toEqual(['prensa']);
	});

	it('la prensa asignada no corre el primer corte: las guillotinas activas', () => {
		expect(passMachineCandidates({ workflowStep: 'guillotine_first_cut', assignedMachineId: 'prensa', machines })).toEqual(['g1', 'g2']);
	});

	it('la agendada para la etapa gana', () => {
		expect(
			passMachineCandidates({
				workflowStep: 'guillotine_first_cut',
				assignedMachineId: 'prensa',
				machines,
				schedule: [{ machine_id: 'prensa' }, { machine_id: 'g2', plan_step: 'corte_inicial' }],
			}),
		).toEqual(['g2']);
	});

	it('una sola de su tipo: esa', () => {
		expect(passMachineCandidates({ workflowStep: 'die_cutting', assignedMachineId: 'prensa', machines })).toEqual(['troquel']);
	});

	it('una etapa sin máquina (bodega) no tiene candidatas', () => {
		expect(stageMachineTypes('in_storage')).toEqual([]);
		expect(passMachineCandidates({ workflowStep: 'in_storage', assignedMachineId: 'prensa', machines })).toEqual([]);
	});
});
