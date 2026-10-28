import { describe, expect, it } from 'vitest';

import { measureAjuste, operatorFor, plantDate, resolveAjuste, type AjusteAssignment } from '../ajuste';
import { setupFor } from '../production-scheduler';

// 14:00 en Santiago (UTC-3) del 27-oct = 17:00Z; 23:30 del 27 = 02:30Z del 28.
const R = (ajuste: number, at = '2026-10-27T17:00:00Z', ot = 'ot1', machine = 'roland') => ({
	ot_id: ot,
	machine_id: machine,
	ajuste_minutes: ajuste,
	created_at: at,
});

const asg = (employee: string, date = '2026-10-27', ot: string | null = null, machine = 'roland'): AjusteAssignment => ({
	employee_id: employee,
	machine_id: machine,
	date,
	ot_id: ot,
});

describe('plantDate', () => {
	it('usa la fecha de la planta, no la UTC', () => {
		expect(plantDate('2026-10-28T02:30:00Z')).toBe('2026-10-27');
	});
});

describe('operatorFor', () => {
	it('una sola persona asignada a la prensa ese día es quien ajustó', () => {
		expect(operatorFor(R(40), [asg('ana')])).toBe('ana');
	});

	it('con dos personas, decide la asignación que nombra la OT', () => {
		expect(operatorFor(R(40), [asg('ana'), asg('beto', '2026-10-27', 'ot1')])).toBe('beto');
	});

	it('con dos personas y ninguna nombrando la OT, no adivina', () => {
		expect(operatorFor(R(40), [asg('ana'), asg('beto')])).toBeNull();
	});

	it('el que mandó el parte manda sobre la asignación del día', () => {
		expect(operatorFor({ ...R(40), operator_employee_id: 'carla' }, [asg('ana')])).toBe('carla');
	});

	it('la asignación de otra prensa u otro día no cuenta', () => {
		expect(operatorFor(R(40), [asg('ana', '2026-10-26'), asg('beto', '2026-10-27', null, 'ryobi')])).toBeNull();
	});
});

describe('measureAjuste', () => {
	it('mediana por prensa y por operario', () => {
		const reports = [R(30), R(40, '2026-10-28T17:00:00Z'), R(90, '2026-10-29T17:00:00Z')];
		const assignments = [asg('ana'), asg('ana', '2026-10-28'), asg('beto', '2026-10-29')];
		const out = measureAjuste(reports, assignments, new Map([['ana', 'Ana'], ['beto', 'Beto']]));
		expect(out.roland.measured).toEqual({ medianMinutes: 40, samples: 3 });
		expect(out.roland.byOperator).toEqual([
			{ employeeId: 'ana', name: 'Ana', medianMinutes: 35, samples: 2 },
			{ employeeId: 'beto', name: 'Beto', medianMinutes: 90, samples: 1 },
		]);
	});

	it('ignora cierres sin ajuste declarado', () => {
		expect(measureAjuste([{ ...R(0), ajuste_minutes: null }], [])).toEqual({});
	});
});

describe('resolveAjuste — precedencia', () => {
	const measured = { medianMinutes: 50, samples: 5 };

	it('trabajo > prensa > medido > presupuesto', () => {
		expect(resolveAjuste({ otOverride: 90, machineManual: 45, measured })).toEqual({ minutes: 90, source: 'trabajo' });
		expect(resolveAjuste({ machineManual: 45, measured })).toEqual({ minutes: 45, source: 'maquina' });
		expect(resolveAjuste({ measured })).toEqual({ minutes: 50, source: 'medido' });
		expect(resolveAjuste({})).toEqual({ minutes: 30, source: 'presupuesto' });
	});

	it('lo medido no manda con menos de 3 muestras', () => {
		expect(resolveAjuste({ measured: { medianMinutes: 80, samples: 2 } }).source).toBe('presupuesto');
	});
});

describe('setupFor — el ajuste depende de la prensa', () => {
	const prensa = (bodies: number | null, manual: number | null = null) => ({
		type: 'offset_printer',
		bodies,
		ajusteManual: manual,
		ajusteMeasured: null,
	});
	const cmyk = { front: 4, back: 0 };

	it('un 4/0 en una prensa de 4 cuerpos es un ajuste; en una de 2, dos', () => {
		expect(setupFor(prensa(4), cmyk)).toMatchObject({ passes: 1, hours: 0.5 });
		expect(setupFor(prensa(2), cmyk)).toMatchObject({ passes: 2, hours: 1 });
	});

	it('usa los minutos de la prensa y la corrección del trabajo', () => {
		expect(setupFor(prensa(4, 45), cmyk)).toMatchObject({ hours: 0.75, source: 'maquina' });
		expect(setupFor(prensa(4, 45), cmyk, 90)).toMatchObject({ hours: 1.5, source: 'trabajo' });
	});

	it('fuera de offset no hay ajuste', () => {
		expect(setupFor({ ...prensa(4), type: 'guillotine' }, cmyk).hours).toBe(0);
		expect(setupFor(prensa(4), undefined).hours).toBe(0);
	});
});
