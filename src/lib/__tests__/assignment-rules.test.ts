import { describe, expect, it } from 'vitest';

import { attributionHealth, checkAssignment, requiresOT, type MachineType } from '../assignment-rules';

/** Todos los valores del enum `machine_type` de la base. */
const TODOS: MachineType[] = [
	'offset_printer', 'die_cutter', 'guillotine', 'digital_printer', 'pre_press',
	'manual_workshop', 'delivery', 'folder', 'collator', 'stitcher', 'perfect_binder', 'laminator',
];

describe('si la máquina produce, el turno nombra la OT', () => {
	it('once de los doce tipos de máquina exigen OT', () => {
		const exigen = TODOS.filter(requiresOT);
		expect(exigen).toHaveLength(11);
		expect(exigen).not.toContain('delivery');
	});

	it('la prensa sin OT no se guarda', () => {
		const v = checkAssignment({ machineType: 'offset_printer', otId: null });
		expect(v.ok).toBe(false);
		// El mensaje explica la consecuencia, no repite la regla: el supervisor
		// necesita saber por qué le importa, no que hay un campo obligatorio.
		expect(v.reason).toContain('margen');
	});

	it('la prensa con OT se guarda', () => {
		expect(checkAssignment({ machineType: 'offset_printer', otId: 'abc-123' }).ok).toBe(true);
	});

	it('el reparto puede ir sin OT, y es a propósito', () => {
		// Un camión sale con la carga de varias órdenes. Obligarlo a elegir una
		// sería inventar una atribución.
		const v = checkAssignment({ machineType: 'delivery', otId: null });
		expect(v.ok).toBe(true);
		expect(v.otRequired).toBe(false);
	});

	it('las terminaciones también: son las que más horas mueven', () => {
		for (const t of ['folder', 'collator', 'stitcher', 'perfect_binder', 'laminator'] as MachineType[]) {
			expect(checkAssignment({ machineType: t, otId: null }).ok).toBe(false);
		}
	});
});

describe('el lado seguro cuando algo no se sabe', () => {
	it('una máquina desconocida exige OT en vez de eximir', () => {
		// Un turno del que no se sabe dónde ocurrió es justamente el que hay que
		// frenar. Y si mañana entra un tipo nuevo al enum, cae de este lado.
		expect(checkAssignment({ machineType: 'maquina_del_futuro', otId: null }).ok).toBe(false);
		expect(requiresOT(null)).toBe(true);
		expect(requiresOT(undefined)).toBe(true);
	});

	it('cadena vacía como OT no cuenta como OT', () => {
		expect(checkAssignment({ machineType: 'guillotine', otId: '' }).ok).toBe(false);
	});
});

describe('cuánto se degradó la atribución', () => {
	it('cuenta sólo los turnos que estaban obligados', () => {
		// El reparto sin OT no es una falla, así que no puede ensuciar el número.
		const v = attributionHealth([
			{ machineType: 'offset_printer', otId: 'a' },
			{ machineType: 'offset_printer', otId: null },
			{ machineType: 'delivery', otId: null },
			{ machineType: 'delivery', otId: null },
		]);
		expect(v.exigibles).toBe(2);
		expect(v.sinOt).toBe(1);
		expect(v.rate).toBe(0.5);
	});

	it('cuando está todo bien no dice nada', () => {
		const v = attributionHealth([
			{ machineType: 'offset_printer', otId: 'a' },
			{ machineType: 'guillotine', otId: 'b' },
		]);
		expect(v.sinOt).toBe(0);
		expect(v.note).toBeNull();
	});

	it('cuando está mal lo dice con la consecuencia', () => {
		const v = attributionHealth([
			{ machineType: 'offset_printer', otId: null },
			{ machineType: 'offset_printer', otId: 'b' },
		]);
		expect(v.note).toContain('1 de 2');
		expect(v.note).toContain('no están en el costo');
	});

	it('sin turnos exigibles no inventa una tasa', () => {
		const v = attributionHealth([{ machineType: 'delivery', otId: null }]);
		expect(v.rate).toBeNull();
		expect(v.note).toBeNull();
	});

	it('lista vacía no revienta', () => {
		expect(attributionHealth([]).rate).toBeNull();
	});
});
