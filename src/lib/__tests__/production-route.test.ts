import { describe, expect, it } from 'vitest';

import { deriveRoute, inferPlanStep, quoteHoursByStatus, remainingRoute, type RouteOT } from '../production-route';

const base: RouteOT = {
	id: 'ot1',
	status: 'in_storage',
	quantity: 10000,
	color_front: 'cmyk',
	calc_sheets: 2500,
	calc_print_hours: 4,
	calc_finish_hours: null,
};

const keys = (ot: RouteOT, types?: Map<string, string>) => deriveRoute(ot, types).map((s) => s.key);

describe('deriveRoute', () => {
	it('una OT offset sin terminaciones: corte, impresión, corte final, embalaje, despacho', () => {
		expect(keys(base)).toEqual(['corte_inicial', 'offset', 'corte_final', 'embalaje', 'despacho']);
	});

	it('las horas de impresión son las del presupuesto', () => {
		const offset = deriveRoute(base).find((s) => s.key === 'offset')!;
		expect(offset).toMatchObject({ quoteHours: 4, source: 'presupuesto' });
	});

	it('lo troquelado se desglosa y no pasa por guillotina final', () => {
		const route = keys({ ...base, finish_troquelado: true });
		expect(route).toContain('troquelado');
		expect(route).toContain('desglose');
		expect(route).not.toContain('corte_final');
		expect(route.indexOf('desglose')).toBeGreaterThan(route.indexOf('troquelado'));
	});

	it('un troquel asignado basta para saber que se troquela', () => {
		expect(keys({ ...base, die_code: 'T-118' })).toContain('desglose');
	});

	it('las etiquetas pasan por revisión antes del embalaje', () => {
		const route = keys({ ...base, product_type: 'etiqueta' });
		expect(route.indexOf('revision_etiquetas')).toBe(route.indexOf('embalaje') - 1);
		expect(keys(base)).not.toContain('revision_etiquetas');
	});

	it('digital si la OT está en digital o su máquina asignada es digital', () => {
		expect(keys({ ...base, status: 'digital_printing' })).toContain('digital');
		const types = new Map([['m-dig', 'digital_printer']]);
		const route = keys({ ...base, assigned_machine_id: 'm-dig' }, types);
		expect(route).toContain('digital');
		expect(route).not.toContain('offset');
		expect(route).not.toContain('corte_inicial');
	});

	it('las terminaciones se reparten por proceso y suman lo que dijo el presupuesto', () => {
		const ot = { ...base, finish_troquelado: true, finish_plegado: true, finish_barniz: true, calc_finish_hours: 6 };
		const route = deriveRoute(ot);
		const finishing = route.filter((s) => ['troquelado', 'plegado', 'terminaciones'].includes(s.key));
		expect(finishing).toHaveLength(3);
		expect(finishing.reduce((s, f) => s + f.quoteHours, 0)).toBeCloseTo(6, 1);
		// El troquelado (1,5 h de preparación) pesa más que el barniz (0,3 h).
		const h = Object.fromEntries(finishing.map((f) => [f.key, f.quoteHours]));
		expect(h.troquelado).toBeGreaterThan(h.terminaciones);
	});

	it('sin impresión no hay cortes ni prensa', () => {
		const route = keys({ ...base, color_front: 'sin_impresion', calc_print_hours: 0 });
		expect(route).toEqual(['embalaje', 'despacho']);
	});
});

describe('remainingRoute', () => {
	const ot = { ...base, finish_troquelado: true };

	it('lo que vive antes de la columna actual del Kanban ya está hecho', () => {
		const route = deriveRoute({ ...ot, status: 'workshop' });
		const left = remainingRoute({ ...ot, status: 'workshop' }, route).map((s) => s.key);
		expect(left).toEqual(['desglose', 'embalaje', 'despacho']);
	});

	it('la etapa de la columna actual está en curso; las siguientes, pendientes', () => {
		const route = deriveRoute({ ...ot, status: 'die_cutting' });
		const left = remainingRoute({ ...ot, status: 'die_cutting' }, route);
		expect(left[0]).toMatchObject({ key: 'troquelado', inProgress: true });
		expect(left.slice(1).every((s) => !s.inProgress)).toBe(true);
	});

	it('descuenta lo ya declarado de la etapa en curso, sin dejarla en cero', () => {
		const current = { ...base, status: 'offset_printing' };
		const route = deriveRoute(current);
		// 4 h de presupuesto = 0,5 h de ajuste (1 pasada 4/0) + 3,5 h de tiraje.
		const partial = remainingRoute(current, route, undefined, new Map([['offset_printing', 3]]));
		expect(partial[0]).toMatchObject({ key: 'offset', hours: 0.53, estimatedHours: 3.5, setupDone: true });
		const over = remainingRoute(current, route, undefined, new Map([['offset_printing', 10]]));
		expect(over[0].hours).toBeCloseTo(0.53, 2);
	});

	it('en offset planifica el tiraje y deja el ajuste para la prensa', () => {
		const offset = remainingRoute(base, deriveRoute(base)).find((s) => s.key === 'offset')!;
		expect(offset.setupColors).toEqual({ front: 4, back: 0 });
		expect(offset.quoteSetupHours).toBe(0.5);
		expect(offset.hours).toBe(3.5);
		expect(offset.setupDone).toBe(false);
	});

	it('un 4/4 en la prensa supuesta del presupuesto son dos ajustes', () => {
		const offset = deriveRoute({ ...base, color_back: 'cmyk' }).find((s) => s.key === 'offset')!;
		expect(offset.quoteSetupHours).toBe(1);
	});

	it('listo para despacho: sólo falta el despacho', () => {
		const s = { ...base, status: 'ready_for_delivery' };
		expect(remainingRoute(s, deriveRoute(s)).map((x) => x.key)).toEqual(['despacho']);
	});

	it('una OT completada no tiene nada pendiente', () => {
		const s = { ...base, status: 'completed' };
		expect(remainingRoute(s, deriveRoute(s))).toEqual([]);
	});
});

describe('quoteHoursByStatus / inferPlanStep', () => {
	it('agrupa por columna del Kanban', () => {
		const route = deriveRoute({ ...base, product_type: 'etiqueta' });
		const byStatus = quoteHoursByStatus(route);
		const rev = route.filter((s) => s.key === 'revision_etiquetas' || s.key === 'embalaje');
		expect(byStatus.get('workshop_revision')).toBeCloseTo(rev.reduce((a, s) => a + s.quoteHours, 0), 5);
	});

	it('una fila sin etapa toma la primera de la ruta que su máquina puede hacer', () => {
		const route = deriveRoute(base);
		expect(inferPlanStep('guillotine', route)).toBe('corte_inicial');
		expect(inferPlanStep('offset_printer', route)).toBe('offset');
		expect(inferPlanStep('die_cutter', route)).toBeNull();
	});
});
