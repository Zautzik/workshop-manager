import { describe, expect, it } from 'vitest';

import {
	estimatedHours,
	groupMachinesForAssignment,
	machineRole,
	suggestedSlot,
} from '../machine-assignment';

// La flota real del taller, tal como está en la base.
const FLOTA = [
	{ id: '1', name: 'Roland 300', type: 'offset_printer' },
	{ id: '2', name: 'Ryobi Offset 524GS #2', type: 'offset_printer' },
	{ id: '3', name: 'Ryobi Offset 524GS #1', type: 'offset_printer' },
	{ id: '4', name: 'Digital Printer', type: 'digital_printer' },
	{ id: '5', name: 'Dobladora', type: 'folder' },
	{ id: '6', name: 'Alzadora', type: 'collator' },
	{ id: '7', name: 'Corchetera', type: 'stitcher' },
	{ id: '8', name: 'Hotmelera', type: 'perfect_binder' },
	{ id: '9', name: 'Polilaminadora', type: 'laminator' },
	{ id: '10', name: 'Troqueladora', type: 'die_cutter' },
	{ id: '11', name: 'Guillotine #1', type: 'guillotine' },
	{ id: '12', name: 'Manual Workshop', type: 'manual_workshop' },
	{ id: '13', name: 'Dispatch Vehicle #1', type: 'delivery' },
];

describe('machineRole', () => {
	it('clasifica las cinco máquinas de terminación reales', () => {
		for (const t of ['folder', 'collator', 'stitcher', 'perfect_binder', 'laminator']) {
			expect(machineRole(t)).toBe('terminacion');
		}
	});

	it('un tipo desconocido cae en apoyo, no revienta', () => {
		expect(machineRole('maquina_del_futuro')).toBe('apoyo');
		expect(machineRole(null)).toBe('apoyo');
		expect(machineRole(undefined)).toBe('apoyo');
	});
});

describe('groupMachinesForAssignment', () => {
	it('pone impresión primero y despacho al final', () => {
		const roles = groupMachinesForAssignment(FLOTA).map((g) => g.role);
		expect(roles[0]).toBe('impresion');
		expect(roles[roles.length - 1]).toBe('despacho');
	});

	it('no devuelve grupos vacíos', () => {
		const grupos = groupMachinesForAssignment([
			{ id: '1', name: 'Roland 300', type: 'offset_printer' },
		]);
		expect(grupos).toHaveLength(1);
		expect(grupos[0].role).toBe('impresion');
	});

	it('ordena por nombre dentro del grupo, con criterio español', () => {
		const impresion = groupMachinesForAssignment(FLOTA).find((g) => g.role === 'impresion')!;
		expect(impresion.machines.map((m) => m.name)).toEqual([
			'Digital Printer',
			'Roland 300',
			'Ryobi Offset 524GS #1',
			'Ryobi Offset 524GS #2',
		]);
	});

	it('no pierde ni duplica ninguna máquina de la flota', () => {
		const total = groupMachinesForAssignment(FLOTA).reduce((n, g) => n + g.machines.length, 0);
		expect(total).toBe(FLOTA.length);
		const ids = groupMachinesForAssignment(FLOTA).flatMap((g) => g.machines.map((m) => m.id));
		expect(new Set(ids).size).toBe(FLOTA.length);
	});

	it('separa el camión de reparto de las máquinas que producen', () => {
		const grupos = groupMachinesForAssignment(FLOTA);
		const despacho = grupos.find((g) => g.role === 'despacho')!;
		expect(despacho.machines.map((m) => m.name)).toEqual(['Dispatch Vehicle #1']);
		// Y no se coló en impresión ni en terminación.
		for (const role of ['impresion', 'terminacion'] as const) {
			const g = grupos.find((x) => x.role === role);
			expect(g?.machines.some((m) => m.type === 'delivery')).toBeFalsy();
		}
	});

	it('lista vacía devuelve lista vacía, no un grupo fantasma', () => {
		expect(groupMachinesForAssignment([])).toEqual([]);
	});
});

describe('estimatedHours', () => {
	it('suma impresión y terminación', () => {
		expect(estimatedHours({ calc_print_hours: 3.5, calc_finish_hours: 1.5 })).toBe(5);
	});

	it('tolera que falte una de las dos', () => {
		expect(estimatedHours({ calc_print_hours: 4, calc_finish_hours: null })).toBe(4);
		expect(estimatedHours({ calc_print_hours: null, calc_finish_hours: 2 })).toBe(2);
	});

	it('sin ninguna de las dos devuelve null, no cero', () => {
		// Cero significaría "no toma tiempo"; null significa "no sabemos".
		expect(estimatedHours({ calc_print_hours: null, calc_finish_hours: null })).toBeNull();
		expect(estimatedHours(null)).toBeNull();
	});

	it('un total de cero se trata como desconocido', () => {
		expect(estimatedHours({ calc_print_hours: 0, calc_finish_hours: 0 })).toBeNull();
	});
});

describe('suggestedSlot', () => {
	it('deriva el fin de las horas de la propia OT', () => {
		const s = suggestedSlot({ calc_print_hours: 3, calc_finish_hours: 1 });
		expect(s.start).toBe('08:00');
		expect(s.end).toBe('12:00');
		expect(s.hours).toBe(4);
	});

	it('maneja medias horas', () => {
		expect(suggestedSlot({ calc_print_hours: 2.5, calc_finish_hours: 0 }).end).toBe('10:30');
	});

	it('sin horas cae a la jornada completa', () => {
		const s = suggestedSlot({ calc_print_hours: null, calc_finish_hours: null });
		expect(s.start).toBe('08:00');
		expect(s.end).toBe('17:00');
		expect(s.hours).toBeNull();
	});

	it('respeta un inicio distinto', () => {
		expect(suggestedSlot({ calc_print_hours: 2, calc_finish_hours: 0 }, '14:00').end).toBe('16:00');
	});

	it('un turno larguísimo no cruza la medianoche', () => {
		// 20 horas desde las 08:00 daría las 04:00 del día siguiente, y la agenda
		// es por día: un fin menor que el inicio se leería como duración negativa.
		const s = suggestedSlot({ calc_print_hours: 20, calc_finish_hours: 0 });
		expect(s.end).toBe('23:59');
		expect(s.end > s.start).toBe(true);
	});
});
