import { describe, expect, it } from 'vitest';

import { MACHINE_TYPE_VALUES } from '@/types/machine-type';
import { PRODUCTION_PHASES } from '@/lib/production-phases';
import {
	MACHINE_GROUP_LABEL,
	MACHINE_GROUP_ORDER,
	groupMachinesByPhase,
	groupMachinesByType,
	machineGroupLabel,
} from '../machine-groups';

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
	{ id: '11', name: 'Guillotine #2', type: 'guillotine' },
	{ id: '12', name: 'Guillotine #1', type: 'guillotine' },
	{ id: '13', name: 'Guillotine #3', type: 'guillotine' },
	{ id: '14', name: 'Manual Workshop', type: 'manual_workshop' },
	{ id: '15', name: 'Dispatch Vehicle #1', type: 'delivery' },
	{ id: '16', name: 'Dispatch Vehicle #2', type: 'delivery' },
	{ id: '17', name: 'Dispatch Vehicle #3', type: 'delivery' },
];

describe('MACHINE_GROUP_LABEL', () => {
	it('nombra TODOS los tipos del enum — ninguno cae al valor crudo', () => {
		// Este es el defecto que traía Planta: su mapa cubría 7 de 12, así que
		// rotulaba secciones enteras "collator" y "stitcher".
		for (const t of MACHINE_TYPE_VALUES) {
			expect(MACHINE_GROUP_LABEL[t], `falta encabezado para "${t}"`).toBeTruthy();
			expect(MACHINE_GROUP_LABEL[t]).not.toBe(t);
		}
	});

	it('el orden incluye todos los tipos, sin repetir', () => {
		expect([...MACHINE_GROUP_ORDER].sort()).toEqual([...MACHINE_TYPE_VALUES].sort());
		expect(new Set(MACHINE_GROUP_ORDER).size).toBe(MACHINE_GROUP_ORDER.length);
	});

	it('un tipo desconocido se degrada legible en vez de reventar', () => {
		expect(machineGroupLabel('maquina_del_futuro')).toBe('maquina del futuro');
		expect(machineGroupLabel(null)).toBe('—');
	});
});

describe('groupMachinesByType', () => {
	it('sigue el recorrido físico: impresión antes que corte, terminación antes que despacho', () => {
		const labels = groupMachinesByType(FLOTA).map((g) => g.label);
		const pos = (l: string) => labels.indexOf(l);
		expect(pos('Prensas Offset')).toBeLessThan(pos('Guillotinas'));
		expect(pos('Guillotinas')).toBeLessThan(pos('Troqueladoras'));
		// El defecto concreto: Despacho salía ANTES que las de terminación.
		expect(pos('Dobladoras')).toBeLessThan(pos('Despacho'));
		expect(pos('Polilaminadoras')).toBeLessThan(pos('Despacho'));
		expect(pos('Despacho')).toBe(labels.length - 1);
	});

	it('ordena por nombre dentro de cada grupo', () => {
		const g = groupMachinesByType(FLOTA).find((x) => x.label === 'Guillotinas')!;
		expect(g.machines.map((m) => m.name)).toEqual([
			'Guillotine #1',
			'Guillotine #2',
			'Guillotine #3',
		]);
	});

	it('no pierde ni duplica ninguna máquina', () => {
		const grupos = groupMachinesByType(FLOTA);
		expect(grupos.reduce((n, g) => n + g.machines.length, 0)).toBe(FLOTA.length);
		expect(new Set(grupos.flatMap((g) => g.machines.map((m) => m.id))).size).toBe(FLOTA.length);
	});

	it('no devuelve grupos vacíos', () => {
		const grupos = groupMachinesByType([{ id: '1', name: 'Roland 300', type: 'offset_printer' }]);
		expect(grupos).toHaveLength(1);
		expect(grupos.every((g) => g.machines.length > 0)).toBe(true);
	});

	it('las cinco de terminación tienen cada una su propia sección', () => {
		const labels = groupMachinesByType(FLOTA).map((g) => g.label);
		for (const l of ['Dobladoras', 'Alzadoras', 'Corcheteras', 'Hotmeleras', 'Polilaminadoras']) {
			expect(labels).toContain(l);
		}
	});

	it('un tipo desconocido va al final, nunca primero', () => {
		const grupos = groupMachinesByType([
			{ id: 'x', name: 'Cosa rara', type: 'other' },
			{ id: '1', name: 'Roland 300', type: 'offset_printer' },
		]);
		expect(grupos[0].label).toBe('Prensas Offset');
		expect(grupos[grupos.length - 1].machines[0].name).toBe('Cosa rara');
	});

	it('lista vacía devuelve lista vacía', () => {
		expect(groupMachinesByType([])).toEqual([]);
	});
});

describe('groupMachinesByPhase', () => {
	const CON_CTP = [{ id: '0', name: 'CTP Offset', type: 'pre_press' }, ...FLOTA];

	it('las seis de terminación caen todas en la misma fase', () => {
		const g = groupMachinesByPhase(CON_CTP).find((x) => x.label === 'Terminación')!;
		expect(g.machines.map((m) => m.name).sort()).toEqual(
			['Alzadora', 'Corchetera', 'Dobladora', 'Hotmelera', 'Manual Workshop', 'Polilaminadora'],
		);
	});

	it('usa las etiquetas del Kanban, no unas propias', () => {
		// Si alguien renombra una fase en `production-phases`, esta prueba obliga
		// a que Equipos siga diciendo lo mismo que el tablero.
		const delKanban = new Set<string>(PRODUCTION_PHASES.map((p) => p.label));
		for (const g of groupMachinesByPhase(CON_CTP)) {
			expect(delKanban.has(g.label), `"${g.label}" no es una fase del Kanban`).toBe(true);
		}
	});

	it('la CTP abre el recorrido y el despacho lo cierra', () => {
		const labels = groupMachinesByPhase(CON_CTP).map((g) => g.label);
		expect(labels[0]).toBe('Diseño');
		expect(labels[labels.length - 1]).toBe('Despacho');
	});

	it('prensas y guillotinas comparten fase, pero no se intercalan', () => {
		const g = groupMachinesByPhase(CON_CTP).find((x) => x.label === 'Corte & Impresión')!;
		// Dentro de la fase se ordena por tipo primero: las tres offset, la
		// digital, y después las guillotinas.
		expect(g.machines.map((m) => m.type)).toEqual([
			'offset_printer', 'offset_printer', 'offset_printer',
			'digital_printer',
			'guillotine', 'guillotine', 'guillotine',
		]);
	});

	it('todo tipo del enum tiene fase — ninguno cae en "Sin clasificar"', () => {
		const una = MACHINE_TYPE_VALUES.map((t, i) => ({ id: String(i), name: `M${i}`, type: t }));
		expect(groupMachinesByPhase(una).some((g) => g.label === 'Sin clasificar')).toBe(false);
	});

	it('un tipo desconocido se aparta en vez de contaminar una fase', () => {
		const g = groupMachinesByPhase([{ id: 'x', name: 'Rara', type: 'ovni' }]);
		expect(g).toHaveLength(1);
		expect(g[0].label).toBe('Sin clasificar');
	});

	it('no pierde ni duplica máquinas', () => {
		const g = groupMachinesByPhase(CON_CTP);
		expect(g.reduce((n, x) => n + x.machines.length, 0)).toBe(CON_CTP.length);
	});
});
