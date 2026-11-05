import { describe, expect, it } from 'vitest';
import { FRACCION_PARCIAL, resolveFlow } from '../whatsapp-flow';
import { nextStatusOnRoute, type RouteOT } from '../production-route';

// OT 41221 tal como está en la base: etiqueta adhesiva troquelada, CMYK +
// Pantone, prensa offset asignada, 57.696 pliegos.
const ot41221: RouteOT = {
	id: 'ot-41221',
	status: 'guillotine_first_cut',
	quantity: 563000,
	product_type: 'etiqueta',
	color_front: 'cmyk_pantone',
	color_back: 'sin_impresion',
	calc_sheets: 57696,
	calc_print_hours: 8.19,
	calc_finish_hours: 32.7,
	assigned_machine_id: 'ryobi',
	finish_troquelado: true,
	finish_barniz: true,
};
const machines = new Map([['ryobi', 'offset_printer']]);
const fin = (extra: Record<string, unknown> = {}) => ({ message_type: 'end', confidence: 100, hours_reported: 6, ...extra });

describe('la ruta de la OT resuelve la bifurcación', () => {
	it('41221: después del primer corte su ruta sigue en offset', () => {
		expect(nextStatusOnRoute(ot41221, 'guillotine_first_cut', machines)).toBe('offset_printing');
	});

	it('con prensa digital asignada, sigue en digital', () => {
		const digital = new Map([['ryobi', 'digital_printer']]);
		expect(nextStatusOnRoute({ ...ot41221, status: 'pre_press' }, 'pre_press', digital)).toBe('digital_printing');
	});

	it('troquelada: del troquel salta el corte final, como dice su ruta', () => {
		expect(nextStatusOnRoute(ot41221, 'die_cutting', machines)).toBe('workshop');
	});

	it('sin contexto, la bifurcación sigue esperando a una persona (comportamiento previo)', () => {
		const p = resolveFlow('guillotine_first_cut', fin());
		expect(p.nextStatus).toBeNull();
	});

	it('con la ruta, el «fin» del primer corte va a offset', () => {
		const p = resolveFlow('guillotine_first_cut', fin(), { routeNext: 'offset_printing' });
		expect(p).toMatchObject({ closeStage: 'guillotine_first_cut', nextStatus: 'offset_printing', hours: 6 });
	});

	it('lo que el mensaje nombra pesa más que la ruta', () => {
		const p = resolveFlow('guillotine_first_cut', fin({ processes_mentioned: ['impresion_digital'] }), { routeNext: 'offset_printing' });
		expect(p.nextStatus).toBe('digital_printing');
	});

	it('un parte de inicio no mueve aunque haya ruta', () => {
		expect(resolveFlow('guillotine_first_cut', { message_type: 'start' }, { routeNext: 'offset_printing' }).nextStatus).toBeNull();
	});
});

describe('avance parcial', () => {
	const ctx = { routeNext: 'offset_printing' as const, stageSheets: 57696 };

	it('41221: 500 de 57.696 pliegos es un avance parcial de 500', () => {
		const p = resolveFlow('guillotine_first_cut', fin({ pliegos_produced: 500 }), ctx);
		expect(p.partialSheets).toBe(500);
		expect(p.reason).toContain('Avance parcial: 500 de 57696');
	});

	it(`cerca del total (≥ ${FRACCION_PARCIAL * 100}%) es la etapa entera: la merma no deja un fragmento fantasma`, () => {
		expect(resolveFlow('guillotine_first_cut', fin({ pliegos_produced: 56000 }), ctx).partialSheets).toBeNull();
	});

	it('sin pliegos en el parte, o sin pliegos calculados, se mueve la OT entera', () => {
		expect(resolveFlow('guillotine_first_cut', fin(), ctx).partialSheets).toBeNull();
		expect(resolveFlow('guillotine_first_cut', fin({ pliegos_produced: 500 }), { routeNext: 'offset_printing' }).partialSheets).toBeNull();
	});

	it('sin destino no hay parcial (no hay a dónde mandar la parte)', () => {
		expect(resolveFlow('guillotine_first_cut', fin({ pliegos_produced: 500 }), { stageSheets: 57696 }).partialSheets).toBeNull();
	});
});
