import { describe, expect, it } from 'vitest';

import type { RouteOT } from '../production-route';
import { buildStageHistory, estimateStep, EMPTY_HISTORY, reportedHoursByStatus } from '../stage-history';

const ot = (id: string, printHours: number): RouteOT => ({
	id,
	status: 'completed',
	quantity: 1000,
	color_front: 'cmyk',
	calc_sheets: 500,
	calc_print_hours: printHours,
});

describe('buildStageHistory', () => {
	it('el factor es la mediana de horas reales ÷ presupuesto, por columna', () => {
		const ots = new Map([
			['a', ot('a', 2)],
			['b', ot('b', 4)],
			['c', ot('c', 10)],
		]);
		const reports = [
			{ ot_id: 'a', workflow_step: 'offset_printing', hours: 3 }, // 1,5
			{ ot_id: 'b', workflow_step: 'offset_printing', hours: 4 }, // 1,0
			{ ot_id: 'c', workflow_step: 'offset_printing', hours: 20 }, // 2,0
		];
		expect(buildStageHistory(reports, ots).byStatus.offset_printing).toEqual({ factor: 1.5, samples: 3 });
	});

	it('las pasadas parciales de una etapa se suman antes de comparar', () => {
		const ots = new Map([['a', ot('a', 4)]]);
		const reports = [
			{ ot_id: 'a', workflow_step: 'offset_printing', hours: 3 },
			{ ot_id: 'a', workflow_step: 'offset_printing', hours: 3 },
		];
		expect(buildStageHistory(reports, ots).byStatus.offset_printing).toEqual({ factor: 1.5, samples: 1 });
	});

	it('descarta lo que es un error de tipeo, no un dato', () => {
		const ots = new Map([['a', ot('a', 4)]]);
		const history = buildStageHistory([{ ot_id: 'a', workflow_step: 'offset_printing', hours: 400 }], ots);
		expect(history.byStatus.offset_printing).toBeUndefined();
	});

	it('atribuye a la máquina sólo cuando la etapa pasó por una sola', () => {
		const ots = new Map([['a', ot('a', 4)]]);
		const types = new Map([['m1', 'offset_printer']]);
		const history = buildStageHistory(
			[{ ot_id: 'a', workflow_step: 'offset_printing', hours: 6, machine_id: 'm1' }],
			ots,
			types,
		);
		expect(history.byStatusMachine['offset_printing:m1']).toEqual({ factor: 1.5, samples: 1 });
	});

	it('no calibra la prensa con horas de taller que el cierre le atribuyó por defecto', () => {
		const ots = new Map([['a', ot('a', 4)]]);
		const types = new Map([['prensa', 'offset_printer']]);
		const history = buildStageHistory(
			[{ ot_id: 'a', workflow_step: 'workshop_revision', hours: 1, machine_id: 'prensa' }],
			ots,
			types,
		);
		expect(history.byStatus.workshop_revision).toBeDefined();
		expect(history.byStatusMachine['workshop_revision:prensa']).toBeUndefined();
	});
});

describe('estimateStep', () => {
	const step = { key: 'offset' as const, quoteHours: 4, source: 'presupuesto' as const };

	it('sin historial, manda el presupuesto', () => {
		expect(estimateStep(step, EMPTY_HISTORY)).toMatchObject({ hours: 4, confidence: 'baja', historyWeight: 0 });
	});

	it('con pocas muestras tampoco se mueve', () => {
		const h = { byStatus: { offset_printing: { factor: 2, samples: 4 } }, byStatusMachine: {} };
		expect(estimateStep(step, h).hours).toBe(4);
	});

	it('con 5 a 19 muestras, 40% historial', () => {
		const h = { byStatus: { offset_printing: { factor: 2, samples: 8 } }, byStatusMachine: {} };
		expect(estimateStep(step, h)).toMatchObject({ hours: 5.6, confidence: 'media' });
	});

	it('con 20 o más, 70% historial, y prefiere la máquina concreta', () => {
		const h = {
			byStatus: { offset_printing: { factor: 2, samples: 30 } },
			byStatusMachine: { 'offset_printing:m1': { factor: 1, samples: 25 } },
		};
		expect(estimateStep(step, h).hours).toBe(6.8);
		expect(estimateStep(step, h, 'm1')).toMatchObject({ hours: 4, confidence: 'alta' });
	});
});

describe('reportedHoursByStatus', () => {
	it('suma las horas declaradas de una OT por columna', () => {
		const reports = [
			{ ot_id: 'a', workflow_step: 'workshop', hours: 1 },
			{ ot_id: 'a', workflow_step: 'workshop', hours: 2.5 },
			{ ot_id: 'b', workflow_step: 'workshop', hours: 9 },
		];
		expect(reportedHoursByStatus(reports, 'a').get('workshop')).toBe(3.5);
	});
});
