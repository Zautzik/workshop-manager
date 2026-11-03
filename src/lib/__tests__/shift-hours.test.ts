import { describe, expect, it } from 'vitest';

import { shiftPaidHours } from '../shift-hours';

describe('shiftPaidHours — horas pagadas, no horario', () => {
	it('el Taller 07–16 con colación de 60 min son 8 h', () => {
		expect(shiftPaidHours({ start_time: '07:00:00', end_time: '16:00:00', break_start: '13:00', break_minutes: 60 })).toBe(8);
	});

	it('sin pausa (o antes de la migración) es fin − inicio, como siempre', () => {
		expect(shiftPaidHours({ start_time: '07:00:00', end_time: '14:00:00' })).toBe(7);
		expect(shiftPaidHours({ start_time: '14:00', end_time: '22:00', break_minutes: 0 })).toBe(8);
	});

	it('la Noche cruza la medianoche', () => {
		expect(shiftPaidHours({ start_time: '22:00', end_time: '07:00' })).toBe(9);
	});

	it('sin turno no hay horas', () => {
		expect(shiftPaidHours(null)).toBe(0);
	});
});
