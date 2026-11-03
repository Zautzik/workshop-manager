import { describe, expect, it } from 'vitest';

import {
	addWorkingHours,
	buildTimeAxis,
	calendarForMachineType,
	CALENDARS,
	deadlineToMs,
	nextWorkingInstant,
	plantParts,
	plantWallClockToMs,
	workingHoursBetween,
} from '../plant-calendar';

const H = 3_600_000;
// Martes 27-oct-2026, hora de Chile (UTC-3 en horario de verano).
const at = (d: number, h: number, m = 0) => plantWallClockToMs(2026, 10, d, h * 60 + m);
const hhmm = (ms: number) => {
	const p = plantParts(ms);
	return `${p.day} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
};

describe('hora de la planta', () => {
	it('una hora de reloj de Santiago vuelve a leerse igual', () => {
		expect(hhmm(at(27, 7))).toBe('27 07:00');
		expect(hhmm(at(27, 21, 30))).toBe('27 21:30');
	});

	it('las 07:00 de la planta no son las 07:00 UTC', () => {
		expect(new Date(at(27, 7)).getUTCHours()).not.toBe(7);
	});
});

describe('calendarios por máquina', () => {
	it('la planta trabaja dos turnos (07–22); sólo el taller manual trabaja uno (07–16)', () => {
		for (const t of ['offset_printer', 'guillotine', 'die_cutter', 'digital_printer', 'laminator', 'folder', 'delivery', null]) {
			expect(calendarForMachineType(t).key).toBe('dos_turnos');
		}
		expect(calendarForMachineType('manual_workshop').key).toBe('taller');
	});
});

describe('tiempo hábil', () => {
	it('antes del turno, el primer instante hábil es las 07:00', () => {
		expect(hhmm(nextWorkingInstant(CALENDARS.taller, at(27, 5)))).toBe('27 07:00');
	});

	it('el cambio de turno de las 14:00 no detiene la prensa', () => {
		expect(hhmm(addWorkingHours(CALENDARS.dos_turnos, at(27, 13), 2))).toBe('27 15:00');
	});

	it('lo que no cabe en el día sigue al día hábil siguiente', () => {
		// Taller: 15:00 + 3 h = 1 h hoy (hasta las 16) + 2 h mañana desde las 07.
		expect(hhmm(addWorkingHours(CALENDARS.taller, at(27, 15), 3))).toBe('28 09:00');
		// Dos turnos: 21:00 + 2 h = 1 h hoy (hasta las 22) + 1 h mañana.
		expect(hhmm(addWorkingHours(CALENDARS.dos_turnos, at(27, 21), 2))).toBe('28 08:00');
	});

	it('el fin de semana no existe', () => {
		// Viernes 30, 15:00 + 2 h de taller → lunes 2-nov 08:00.
		const end = addWorkingHours(CALENDARS.taller, at(30, 15), 2);
		const p = plantParts(end);
		expect([p.month, p.day, p.hour]).toEqual([11, 2, 8]);
	});

	it('cuenta horas hábiles entre dos instantes', () => {
		expect(workingHoursBetween(CALENDARS.taller, at(27, 7), at(28, 7))).toBe(8); // 07–16 menos la colación 13–14
		expect(workingHoursBetween(CALENDARS.dos_turnos, at(27, 7), at(28, 7))).toBe(15);
		expect(workingHoursBetween(CALENDARS.taller, at(28, 7), at(27, 7))).toBe(0);
	});
});

describe('buildTimeAxis — el eje sólo tiene horas de planta', () => {
	// Viernes 30-oct a las 10:00, 3 días hábiles, 10 px por hora.
	const axis = buildTimeAxis(CALENDARS.dos_turnos, at(30, 10), 3, 10);

	it('salta noches y fin de semana: vie, lun, mar de 07 a 22', () => {
		expect(axis.days.map((d) => hhmm(d.start))).toEqual(['30 07:00', '2 07:00', '3 07:00']);
		expect(axis.width).toBe(3 * 15 * 10);
	});

	it('las 22:00 del viernes y las 07:00 del lunes son el mismo píxel', () => {
		expect(axis.xOf(at(30, 22))).toBe(150);
		expect(axis.xOf(plantWallClockToMs(2026, 11, 2, 7 * 60))).toBe(150);
		// La madrugada se pega al principio del día siguiente.
		expect(axis.xOf(plantWallClockToMs(2026, 11, 1, 3 * 60))).toBe(150);
	});

	it('msAt deshace xOf dentro del turno', () => {
		const t = plantWallClockToMs(2026, 11, 2, 9 * 60 + 30);
		expect(axis.msAt(axis.xOf(t))).toBe(t);
	});
});

describe('deadlineToMs', () => {
	it('el plazo vence al terminar el día elegido, en la planta', () => {
		const ms = deadlineToMs('2026-08-17T00:00:00+00:00')!;
		const p = plantParts(ms);
		expect([p.month, p.day, p.hour, p.minute]).toEqual([8, 17, 23, 59]);
		expect(ms + 1 - plantWallClockToMs(2026, 8, 17, 0)).toBe(24 * H);
	});

	it('sin plazo, no hay instante', () => {
		expect(deadlineToMs(null)).toBeNull();
		expect(deadlineToMs('no es fecha')).toBeNull();
	});
});
