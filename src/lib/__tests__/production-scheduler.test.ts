import { describe, expect, it } from 'vitest';

import { plantParts, plantWallClockToMs } from '../plant-calendar';
import type { RemainingStep } from '../production-route';
import { buildSchedule, compareSchedules, lanesForStep, type SchedOT } from '../production-scheduler';

// Martes 27-oct-2026, 07:00 en la planta.
const NOW = plantWallClockToMs(2026, 10, 27, 7 * 60);
const H = 3_600_000;

const MACHINES = [
	{ id: 'offset1', name: 'Ryobi #1', type: 'offset_printer' },
	{ id: 'guill', name: 'Guillotina', type: 'guillotine' },
	{ id: 'taller', name: 'Taller', type: 'manual_workshop' },
	{ id: 'camion', name: 'Camión', type: 'delivery' },
	{ id: 'alzadora', name: 'Alzadora', type: 'collator' },
];

const step = (key: RemainingStep['key'], hours: number, inProgress = false): RemainingStep => ({
	key,
	hours,
	estimatedHours: hours,
	quoteHours: hours,
	source: 'presupuesto',
	inProgress,
});

const ot = (id: string, steps: RemainingStep[], extra: Partial<SchedOT> = {}): SchedOT => ({
	id,
	ot_number: id,
	status: 'in_storage',
	steps,
	...extra,
});

const hhmm = (ms: number) => {
	const p = plantParts(ms);
	return `${p.day} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
};

describe('buildSchedule', () => {
	it('encadena las etapas de una OT: cada una empieza cuando termina la anterior', () => {
		const s = buildSchedule({
			now: NOW,
			machines: MACHINES,
			pins: [],
			ots: [ot('A', [step('corte_inicial', 1), step('offset', 4), step('embalaje', 2), step('despacho', 2)])],
		});
		const [corte, offset, embalaje, despacho] = s.blocks;
		expect(hhmm(corte.start)).toBe('27 07:00');
		expect(offset.start).toBe(corte.end);
		expect(hhmm(offset.end)).toBe('27 12:00');
		expect(embalaje.start).toBe(offset.end);
		// Embalaje 12–14, despacho 14–16: el taller cierra a las 16.
		expect(hhmm(despacho.end)).toBe('27 16:00');
	});

	it('una máquina hace una cosa a la vez', () => {
		const s = buildSchedule({
			now: NOW,
			machines: MACHINES,
			pins: [],
			ots: [ot('A', [step('offset', 3)]), ot('B', [step('offset', 3)])],
		});
		const [a, b] = s.blocks;
		expect(b.start).toBeGreaterThanOrEqual(a.end);
	});

	it('la etapa en curso conserva la máquina aunque otra OT sea más urgente', () => {
		const s = buildSchedule({
			now: NOW,
			machines: MACHINES,
			pins: [],
			ots: [
				ot('URG', [step('offset', 3)], { priority_level: 'urgente' }),
				ot('RUN', [step('offset', 2, true)], { status: 'offset_printing' }),
			],
		});
		const run = s.blocks.find((b) => b.otId === 'RUN')!;
		const urg = s.blocks.find((b) => b.otId === 'URG')!;
		expect(hhmm(run.start)).toBe('27 07:00');
		expect(urg.start).toBe(run.end);
	});

	it('entre pendientes manda la prioridad, después el plazo', () => {
		const s = buildSchedule({
			now: NOW,
			machines: MACHINES,
			pins: [],
			ots: [
				ot('TARDE', [step('offset', 1)], { deadline: '2026-11-20' }),
				ot('PRONTO', [step('offset', 1)], { deadline: '2026-11-01' }),
				ot('ALTA', [step('offset', 1)], { deadline: '2026-12-01', priority_level: 'alta' }),
			],
		});
		const order = [...s.blocks].sort((a, b) => a.start - b.start).map((b) => b.otId);
		expect(order).toEqual(['ALTA', 'PRONTO', 'TARDE']);
	});

	it('lo fijado a mano no se mueve y el resto se acomoda alrededor', () => {
		const pinStart = NOW + 1 * H;
		const s = buildSchedule({
			now: NOW,
			machines: MACHINES,
			pins: [{ slotId: 'slot1', otId: 'FIJA', step: 'offset', machineId: 'offset1', start: pinStart, end: pinStart + 3 * H }],
			ots: [ot('FIJA', [step('offset', 3)]), ot('LIBRE', [step('offset', 2)])],
		});
		const fija = s.blocks.find((b) => b.otId === 'FIJA')!;
		const libre = s.blocks.find((b) => b.otId === 'LIBRE')!;
		expect(fija).toMatchObject({ pinned: true, slotId: 'slot1', start: pinStart });
		// 2 h no caben en la hora libre de 07 a 08: va después del bloque fijo.
		expect(libre.start).toBe(fija.end);
	});

	it('un horario fijado que ya pasó con la etapa abierta se reprograma, conservando la fila', () => {
		const s = buildSchedule({
			now: NOW,
			machines: MACHINES,
			pins: [{ slotId: 'vieja', otId: 'A', step: 'offset', machineId: 'offset1', start: NOW - 900 * H, end: NOW - 890 * H }],
			ots: [ot('A', [step('offset', 2, true)], { status: 'offset_printing' })],
		});
		const b = s.blocks[0];
		expect(hhmm(b.start)).toBe('27 07:00');
		expect(b).toMatchObject({ pinned: false, slotId: 'vieja' });
		expect(b.note).toMatch(/ya pasó/);
		expect(b.conflict).toBeUndefined();
	});

	it('el taller manual trabaja en paralelo según sus puestos (max_workers)', () => {
		const machines = [{ id: 'taller', name: 'Taller', type: 'manual_workshop', max_workers: 3 }];
		const s = buildSchedule({
			now: NOW,
			machines,
			pins: [],
			ots: [ot('A', [step('embalaje', 4)]), ot('B', [step('embalaje', 4)]), ot('C', [step('embalaje', 4)])],
		});
		expect(s.lanes.map((l) => l.name)).toEqual(['Taller #1', 'Taller #2', 'Taller #3']);
		expect(s.lanes.every((l) => l.machineId === 'taller')).toBe(true);
		expect(new Set(s.blocks.map((b) => b.start)).size).toBe(1);
	});

	it('una prensa no se divide aunque su dotación sea de varias personas', () => {
		const s = buildSchedule({
			now: NOW,
			machines: [{ id: 'p', name: 'Ryobi', type: 'offset_printer', max_workers: 2 }],
			pins: [],
			ots: [],
		});
		expect(s.lanes).toHaveLength(1);
	});

	it('marca un bloque fijo que empieza antes de que termine la etapa anterior', () => {
		const s = buildSchedule({
			now: NOW,
			machines: MACHINES,
			pins: [{ slotId: 's', otId: 'A', step: 'offset', machineId: 'offset1', start: NOW, end: NOW + 2 * H }],
			ots: [ot('A', [step('corte_inicial', 2), step('offset', 2)])],
		});
		expect(s.blocks.find((b) => b.step === 'offset')!.conflict).toMatch(/antes de que termine corte inicial/);
	});

	it('sin máquina del tipo, crea un carril virtual en vez de perder la etapa', () => {
		const s = buildSchedule({ now: NOW, machines: MACHINES, pins: [], ots: [ot('A', [step('troquelado', 2)])] });
		expect(s.blocks[0].laneId).toBe('virtual:die_cutter');
		expect(s.lanes.find((l) => l.id === 'virtual:die_cutter')?.virtual).toBe(true);
	});

	it('los carriles van en orden de flujo y omiten máquinas que el plan no usa', () => {
		const s = buildSchedule({ now: NOW, machines: MACHINES, pins: [], ots: [] });
		expect(s.lanes.map((l) => l.id)).toEqual(['guill', 'offset1', 'taller', 'camion']);
	});

	it('proyecta la entrega contra el plazo', () => {
		const s = buildSchedule({
			now: NOW,
			machines: MACHINES,
			pins: [],
			ots: [ot('A', [step('offset', 2)], { deadline: '2026-10-26' })],
		});
		expect(s.projections.get('A')!.lateHours).toBeGreaterThan(0);
	});
});

describe('ajuste de prensa en el programa', () => {
	const presses = [
		{ id: 'grande', name: 'Roland 4c', type: 'offset_printer', colors: 4, ajuste_minutes: 30 },
		{ id: 'chica', name: 'Ryobi 2c', type: 'offset_printer', colors: 2, ajuste_minutes: 30 },
	];
	const offset = (hours: number, inProgress = false): RemainingStep => ({
		...step('offset', hours, inProgress),
		setupColors: { front: 4, back: 0 },
	});

	it('el bloque suma el ajuste de la prensa donde cae', () => {
		const s = buildSchedule({ now: NOW, machines: [presses[0]], pins: [], ots: [ot('A', [offset(2)])] });
		expect(s.blocks[0]).toMatchObject({ hours: 2.5, setupHours: 0.5 });
		expect(s.blocks[0].setup).toMatchObject({ passes: 1, perPassMinutes: 30, source: 'maquina' });
	});

	it('elige la prensa donde termina antes contando el ajuste extra de la chica', () => {
		const s = buildSchedule({ now: NOW, machines: presses, pins: [], ots: [ot('A', [offset(2)])] });
		expect(s.blocks[0].laneId).toBe('grande');
	});

	it('la corrección de la OT manda sobre la prensa', () => {
		const s = buildSchedule({
			now: NOW,
			machines: [presses[0]],
			pins: [],
			ots: [ot('A', [offset(2)], { ajuste_minutes: 90 })],
		});
		expect(s.blocks[0]).toMatchObject({ setupHours: 1.5, hours: 3.5 });
		expect(s.blocks[0].setup.source).toBe('trabajo');
	});

	it('si la etapa ya declaró horas, el ajuste está hecho', () => {
		const s = buildSchedule({
			now: NOW,
			machines: [presses[0]],
			pins: [],
			ots: [ot('A', [{ ...offset(2, true), setupDone: true }], { status: 'offset_printing' })],
		});
		expect(s.blocks[0].setupHours).toBe(0);
	});
});

describe('compareSchedules — el efecto de un atraso en la cadena', () => {
	it('un atraso en la offset arrastra a la OT que espera la máquina', () => {
		const input = {
			now: NOW,
			machines: MACHINES,
			pins: [],
			ots: [
				ot('A', [step('offset', 3), step('embalaje', 1)], { priority_level: 'alta' }),
				ot('B', [step('offset', 2), step('embalaje', 1)], { deadline: '2026-10-27' }),
			],
		};
		const base = buildSchedule(input);
		const alt = buildSchedule({ ...input, delays: { 'A:offset': 4 } });
		const impact = compareSchedules(base, alt);
		expect(impact.map((i) => i.otId).sort()).toEqual(['A', 'B']);
		expect(impact.find((i) => i.otId === 'B')).toMatchObject({ becomesLate: true });
		expect(alt.blocks.find((b) => b.id === 'A:offset')!.delayHours).toBe(4);
	});
});

describe('lanesForStep', () => {
	it('un bloque sólo puede soltarse en una máquina que haga esa etapa', () => {
		const s = buildSchedule({ now: NOW, machines: MACHINES, pins: [], ots: [] });
		expect(lanesForStep(s.lanes, 'corte_final').map((l) => l.id)).toEqual(['guill']);
		expect(lanesForStep(s.lanes, 'embalaje').map((l) => l.id)).toEqual(['taller']);
	});
});
