import { describe, expect, it } from 'vitest';
import { dateToLocalIso, startOfIsoWeek, weekDatesFrom } from '../week-dates';

describe('dateToLocalIso', () => {
	it('usa el día/mes/año LOCAL del Date, no el de UTC', () => {
		// La forma de probar esto sin depender de la zona horaria de quien
		// corre el test: comparar contra los getters locales directamente,
		// no contra un string fijo que asumiría una zona horaria particular.
		const d = new Date(2026, 7, 24, 23, 30); // 24 de agosto, 23:30 local
		const iso = dateToLocalIso(d);
		const [y, m, day] = iso.split('-').map(Number);
		expect(y).toBe(d.getFullYear());
		expect(m).toBe(d.getMonth() + 1);
		expect(day).toBe(d.getDate());
	});

	it('el bug que esto reemplaza: toISOString() puede dar el día siguiente', () => {
		// A las 23:30 en un huso horario negativo (Chile, UTC-3/-4),
		// toISOString() ya cruzó a mañana en UTC. Esta función no debe.
		const d = new Date(2026, 7, 24, 23, 30);
		const naive = d.toISOString().split('T')[0];
		const correct = dateToLocalIso(d);
		// En UTC o husos positivos esto puede coincidir — lo que importa es
		// que `correct` siempre refleje getDate(), nunca el corrimiento de
		// toISOString().
		expect(Number(correct.split('-')[2])).toBe(d.getDate());
		if (d.getTimezoneOffset() < 0) {
			// Huso horario detrás de UTC (como Chile): el defecto real se
			// manifiesta acá.
			expect(naive).not.toBe(correct);
		}
	});
});

describe('startOfIsoWeek', () => {
	it('el lunes es el inicio de semana, no el domingo', () => {
		const domingo = new Date(2026, 7, 30); // domingo 30 de agosto 2026
		const inicio = startOfIsoWeek(domingo);
		expect(inicio.getDay()).toBe(1); // lunes
		expect(dateToLocalIso(inicio)).toBe('2026-08-24');
	});

	it('un lunes es su propio inicio de semana', () => {
		const lunes = new Date(2026, 7, 24);
		expect(dateToLocalIso(startOfIsoWeek(lunes))).toBe('2026-08-24');
	});
});

describe('weekDatesFrom', () => {
	it('devuelve 7 días consecutivos empezando en el lunes dado', () => {
		const lunes = new Date(2026, 7, 24);
		const semana = weekDatesFrom(lunes);
		expect(semana).toHaveLength(7);
		expect(semana.map(dateToLocalIso)).toEqual([
			'2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27',
			'2026-08-28', '2026-08-29', '2026-08-30',
		]);
	});
});
