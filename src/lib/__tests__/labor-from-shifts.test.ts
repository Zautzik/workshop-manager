import { describe, expect, it } from 'vitest';
import { laborForPass, shiftIntervals, type ShiftDef } from '@/lib/labor-from-shifts';
import { plantWallClockToMs } from '@/lib/plant-calendar';

const H = 3_600_000;
const shifts = new Map<string, ShiftDef>([
	['m', { id: 'm', name: 'Mañana', start_time: '07:00', end_time: '14:00', break_minutes: 0 }],
	['t', { id: 't', name: 'Tarde', start_time: '14:00', end_time: '22:00', break_minutes: 0 }],
	['n', { id: 'n', name: 'Noche', start_time: '22:00', end_time: '07:00', break_minutes: 0 }],
	['w', { id: 'w', name: 'Taller', start_time: '07:00', end_time: '16:00', break_start: '13:00', break_minutes: 60 }],
]);
const rates = [
	{ employee_id: 'ana', hourly_rate: 10000, effective_from: '2026-01-01', effective_to: null },
	{ employee_id: 'beto', hourly_rate: 12000, effective_from: '2026-01-01', effective_to: '2026-11-09' },
	{ employee_id: 'beto', hourly_rate: 13000, effective_from: '2026-11-10', effective_to: null },
	{ employee_id: 'caro', hourly_rate: 9000, effective_from: '2026-01-01', effective_to: null },
];
const at = (day: number, hh: number, mm = 0) => plantWallClockToMs(2026, 11, day, hh * 60 + mm);

describe('shiftIntervals', () => {
	it('quita la colación del Taller', () => {
		const spans = shiftIntervals('2026-11-10', shifts.get('w')!);
		expect(spans).toEqual([
			[at(10, 7), at(10, 13)],
			[at(10, 14), at(10, 16)],
		]);
	});

	it('la Noche termina al día siguiente', () => {
		expect(shiftIntervals('2026-11-10', shifts.get('n')!)).toEqual([[at(10, 22), at(11, 7)]]);
	});
});

describe('laborForPass', () => {
	it('coloca las horas hacia atrás desde el cierre y las cruza de turno', () => {
		const r = laborForPass({
			closedAtMs: at(10, 15),
			hours: 3,
			assignments: [
				{ employee_id: 'ana', date: '2026-11-10', shift_id: 'm' },
				{ employee_id: 'beto', date: '2026-11-10', shift_id: 't' },
			],
			shifts,
			rates,
		});
		expect(r.uncoveredHours).toBe(0);
		// Pegada al cierre: 3 h antes de las 15:00.
		expect(r.placedFromMs).toBe(at(10, 12));
		expect(r.lines).toEqual([
			{ employee_id: 'ana', date: '2026-11-10', shift_name: 'Mañana', hours: 2, rate: 10000 },
			{ employee_id: 'beto', date: '2026-11-10', shift_name: 'Tarde', hours: 1, rate: 13000 },
		]);
	});

	it('dos personas en el mismo turno cargan las mismas horas cada una', () => {
		const r = laborForPass({
			closedAtMs: at(10, 12),
			hours: 2,
			assignments: [
				{ employee_id: 'ana', date: '2026-11-10', shift_id: 'm' },
				{ employee_id: 'caro', date: '2026-11-10', shift_id: 'm' },
				{ employee_id: 'ana', date: '2026-11-10', shift_id: 'm' }, // duplicada en Planta
			],
			shifts,
			rates,
		});
		expect(r.lines.map((l) => [l.employee_id, l.hours])).toEqual([
			['ana', 2],
			['caro', 2],
		]);
	});

	it('salta la noche sin turno y sigue en el día anterior', () => {
		const r = laborForPass({
			closedAtMs: at(10, 9),
			hours: 4,
			assignments: [
				{ employee_id: 'ana', date: '2026-11-10', shift_id: 'm' },
				{ employee_id: 'beto', date: '2026-11-09', shift_id: 't' },
			],
			shifts,
			rates,
		});
		// Tuvo que saltar la noche: empezó a las 20:00 del día anterior.
		expect(r.placedFromMs).toBe(at(9, 20));
		expect(r.lines).toEqual([
			{ employee_id: 'beto', date: '2026-11-09', shift_name: 'Tarde', hours: 2, rate: 12000 },
			{ employee_id: 'ana', date: '2026-11-10', shift_name: 'Mañana', hours: 2, rate: 10000 },
		]);
	});

	it('turnos que se pisan no duplican las horas de la OT, pero cargan a toda su gente', () => {
		// Mañana 07–14 y Taller 07–13/14–16 en la misma máquina; cierre 15:00, 3 h.
		const r = laborForPass({
			closedAtMs: at(10, 15),
			hours: 3,
			assignments: [
				{ employee_id: 'ana', date: '2026-11-10', shift_id: 'm' },
				{ employee_id: 'caro', date: '2026-11-10', shift_id: 'w' },
			],
			shifts,
			rates,
		});
		// 14–15 sólo Taller; 12–14: Mañana entera, Taller sólo 12–13.
		expect(r.lines).toEqual([
			{ employee_id: 'ana', date: '2026-11-10', shift_name: 'Mañana', hours: 2, rate: 10000 },
			{ employee_id: 'caro', date: '2026-11-10', shift_name: 'Taller', hours: 2, rate: 9000 },
		]);
		expect(r.uncoveredHours).toBe(0);
	});

	it('lo que no cae en un turno con gente queda sin dotación, sin inventar a nadie', () => {
		const r = laborForPass({
			closedAtMs: at(10, 9),
			hours: 5,
			assignments: [{ employee_id: 'ana', date: '2026-11-10', shift_id: 'm' }],
			shifts,
			rates,
		});
		expect(r.lines).toEqual([{ employee_id: 'ana', date: '2026-11-10', shift_name: 'Mañana', hours: 2, rate: 10000 }]);
		expect(r.uncoveredHours).toBe(3);
	});

	it('sin tarifa vigente la línea sale con rate null', () => {
		const r = laborForPass({
			closedAtMs: at(10, 9),
			hours: 1,
			assignments: [{ employee_id: 'nadie', date: '2026-11-10', shift_id: 'm' }],
			shifts,
			rates,
		});
		expect(r.lines[0].rate).toBeNull();
	});

	it('cero horas, nada', () => {
		expect(laborForPass({ closedAtMs: at(10, 9), hours: 0, assignments: [], shifts, rates })).toEqual({ lines: [], uncoveredHours: 0, placedFromMs: null });
		expect(H).toBeGreaterThan(0);
	});
});
