import { describe, expect, it } from 'vitest';

import { createShiftResolver, definitionFor, shiftCovering, shiftLabel, shiftWindow, type ShiftModel } from '../machine-calendar';
import { addWorkingHours, CALENDARS, fullDaySegments, plantParts, plantWallClockToMs, workingIntervals } from '../plant-calendar';

const DEFS = [
	{ id: 'm', code: 'manana', name: 'Mañana', start_time: '07:00:00', end_time: '14:00:00', sort_order: 1 },
	{ id: 't', code: 'tarde', name: 'Tarde', start_time: '14:00:00', end_time: '22:00:00', sort_order: 2 },
	{ id: 'n', code: 'noche', name: 'Noche', start_time: '22:00:00', end_time: '07:00:00', is_night_shift: true, sort_order: 3 },
	{ id: 'w', code: 'taller', name: 'Taller', start_time: '07:00:00', end_time: '16:00:00', sort_order: 4 },
];
const LV = [1, 2, 3, 4, 5];

const model = (extra: Partial<ShiftModel> = {}): ShiftModel => ({
	shifts: DEFS,
	patterns: [
		{ machine_id: 'ryobi', shift_id: 'm', weekdays: LV },
		{ machine_id: 'ryobi', shift_id: 't', weekdays: LV },
		{ machine_id: 'taller', shift_id: 'w', weekdays: LV },
	],
	roster: [],
	...extra,
});

// Martes 27-oct-2026 en la planta.
const at = (d: number, h: number, m = 0, month = 10) => plantWallClockToMs(2026, month, d, h * 60 + m);
const hhmm = (ms: number) => {
	const p = plantParts(ms);
	return `${p.day} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
};
const firstIntervals = (cal: Parameters<typeof workingIntervals>[0], from: number, n = 3) => {
	const out: string[] = [];
	for (const [s, e] of workingIntervals(cal, from)) {
		out.push(`${hhmm(s)}→${hhmm(e)}`);
		if (out.length >= n) break;
	}
	return out;
};

describe('definiciones', () => {
	it('la Noche cruza la medianoche', () => {
		expect(shiftWindow(DEFS[2])).toMatchObject({ start: 22 * 60, end: 31 * 60 });
		expect(shiftLabel(DEFS[2])).toBe('Noche 22–07');
	});

	it('abrir turno a las 23:00 ofrece la Noche; a las 15:00, la Tarde', () => {
		expect(shiftCovering(DEFS, 23 * 60)?.code).toBe('noche');
		expect(shiftCovering(DEFS, 3 * 60)?.code).toBe('noche');
		expect(shiftCovering(DEFS, 15 * 60)?.code).toBe('tarde');
	});
});

describe('patrón habitual', () => {
	const r = createShiftResolver(model());

	it('Mañana + Tarde se funden en un tramo 07–22', () => {
		const cal = r.calendarFor('ryobi', CALENDARS.taller);
		expect(cal.label).toBe('Mañana 07–14 + Tarde 14–22');
		expect(firstIntervals(cal, at(27, 5), 2)).toEqual(['27 07:00→27 22:00', '28 07:00→28 22:00']);
	});

	it('una máquina sin patrón ni dotación usa el supuesto por tipo', () => {
		expect(r.calendarFor('guillotina', CALENDARS.dos_turnos)).toBe(CALENDARS.dos_turnos);
	});
});

describe('dotación de Planta', () => {
	it('asignar operarios a la Noche abre esa noche, y se une con la mañana siguiente', () => {
		const r = createShiftResolver(
			model({
				roster: [
					{ machine_id: 'ryobi', shift_id: 'm', date: '2026-10-29', employee_name: 'Ana' },
					{ machine_id: 'ryobi', shift_id: 't', date: '2026-10-29', employee_name: 'Beto' },
					{ machine_id: 'ryobi', shift_id: 'n', date: '2026-10-29', employee_name: 'Carla' },
				],
			}),
		);
		const cal = r.calendarFor('ryobi', CALENDARS.taller);
		// Jueves 29: 07–22 + Noche 22–07 = de corrido hasta el viernes 22:00.
		expect(firstIntervals(cal, at(29, 6), 1)).toEqual(['29 07:00→30 22:00']);
		// 10 h desde el jueves 20:00 ya no esperan al viernes: corren de noche.
		expect(hhmm(addWorkingHours(cal, at(29, 20), 10))).toBe('30 06:00');
	});

	it('la dotación manda sólo para esa máquina y ese día', () => {
		const r = createShiftResolver(
			model({ roster: [{ machine_id: 'ryobi', shift_id: 'm', date: '2026-10-28', employee_name: 'Ana' }] }),
		);
		const ryobi = r.calendarFor('ryobi', CALENDARS.taller);
		// Miércoles 28 sólo tiene Mañana cargada: la Tarde de ese día no corre.
		expect(firstIntervals(ryobi, at(28, 5), 2)).toEqual(['28 07:00→28 14:00', '29 07:00→29 22:00']);
		// El taller no tiene dotación: sigue su patrón.
		expect(firstIntervals(r.calendarFor('taller', CALENDARS.dos_turnos), at(28, 5), 1)).toEqual(['28 07:00→28 16:00']);
	});

	it('las asignaciones a turnos archivados no abren nada', () => {
		const r = createShiftResolver(
			model({ roster: [{ machine_id: 'ryobi', shift_id: 'viejo', date: '2026-10-28', employee_name: 'Ana' }] }),
		);
		expect(firstIntervals(r.calendarFor('ryobi', CALENDARS.taller), at(28, 5), 1)).toEqual(['28 07:00→28 22:00']);
	});

	it('los turnos concretos dicen quién está y de dónde salen', () => {
		const r = createShiftResolver(
			model({ roster: [{ machine_id: 'ryobi', shift_id: 'n', date: '2026-10-28', employee_name: 'Carla' }] }),
		);
		const list = r.instances('ryobi', at(28, 0), at(29, 23));
		expect(list.map((i) => `${i.shift.code}:${i.source}:${i.operators.join(',')}`)).toEqual([
			'noche:dotacion:Carla',
			'manana:patron:',
			'tarde:patron:',
		]);
		expect(hhmm(list[0].start)).toBe('28 22:00');
		expect(hhmm(list[0].end)).toBe('29 07:00');
	});
});

describe('eje de 24 h', () => {
	it('días completos, fin de semana incluido', () => {
		const segs = fullDaySegments(at(30, 10), 3);
		expect(segs.map(([s]) => hhmm(s))).toEqual(['30 00:00', '31 00:00', '1 00:00']);
		expect((segs[0][1] - segs[0][0]) / 3_600_000).toBe(24);
	});
});

describe('definitionFor — dotación cargada sobre filas archivadas', () => {
	const old = (start_time: string, end_time: string) => ({ id: 'viejo', start_time, end_time });

	it('una definición vigente es ella misma', () => {
		expect(definitionFor(DEFS[1], DEFS)?.code).toBe('tarde');
	});

	it('lee una fila vieja como la definición con la que más se solapa', () => {
		expect(definitionFor(old('07:00:00', '15:00:00'), DEFS)?.code).toBe('manana');
		expect(definitionFor(old('08:00:00', '14:00:00'), DEFS)?.code).toBe('manana'); // empate 6–6: gana el orden
		expect(definitionFor(old('16:00:00', '00:00:00'), DEFS)?.code).toBe('tarde');
	});

	it('el Taller sólo es candidato para el taller manual', () => {
		// 8 h de solape con Taller contra 7 con Mañana: en una prensa sigue siendo Mañana.
		expect(definitionFor(old('07:00:00', '15:00:00'), DEFS, 'offset_printer')?.code).toBe('manana');
		expect(definitionFor(old('07:00:00', '15:00:00'), DEFS, 'manual_workshop')?.code).toBe('taller');
	});

	it('entiende turnos que cruzan la medianoche, de los dos lados', () => {
		expect(definitionFor(old('23:00:00', '07:00:00'), DEFS)?.code).toBe('noche');
		expect(definitionFor(old('00:00:00', '06:00:00'), DEFS)?.code).toBe('noche');
	});

	it('sin fila o sin horario no inventa un turno', () => {
		expect(definitionFor(null, DEFS)).toBeNull();
		expect(definitionFor({ id: 'x', start_time: '', end_time: '' }, DEFS)).toBeNull();
	});
});
