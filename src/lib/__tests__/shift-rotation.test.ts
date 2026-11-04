import { describe, expect, it } from 'vitest';

import { decideRotationWrites, describeWeek, mondayOf, planRotation, teamShift, validateRotation, weeksSince, type Rotation } from '../shift-rotation';

const M = 'manana';
const T = 'tarde';
const N = 'noche';

// Semana de referencia: lunes 2-nov-2026, el equipo A en Mañana.
const prensas = (extra: Partial<Rotation> = {}): Rotation => ({
	id: 'rot',
	name: 'Prensas',
	shift_ids: [M, T],
	weekdays: [1, 2, 3, 4, 5],
	saturday_shift_id: M,
	anchor_week: '2026-11-02',
	active: true,
	teams: [
		{ id: 'A', name: 'Equipo A', position: 0, members: [{ employee_id: 'carlos', machine_id: 'ryobi1', role: 'Operador' }] },
		{ id: 'B', name: 'Equipo B', position: 1, members: [{ employee_id: 'luis', machine_id: 'ryobi1', role: 'Operador' }] },
	],
	...extra,
});

const who = (rows: ReturnType<typeof planRotation>, date: string) =>
	rows.filter((r) => r.date === date).map((r) => `${r.employee_id}:${r.shift_id}`).sort();

describe('semanas', () => {
	it('el lunes de cualquier día de la semana', () => {
		expect(mondayOf('2026-11-04')).toBe('2026-11-02');
		expect(mondayOf('2026-11-08')).toBe('2026-11-02'); // domingo
		expect(mondayOf('2026-11-09')).toBe('2026-11-09');
	});

	it('cuenta semanas desde la de referencia, también hacia atrás', () => {
		expect(weeksSince('2026-11-02', '2026-11-13')).toBe(1);
		expect(weeksSince('2026-11-02', '2026-10-28')).toBe(-1);
	});
});

describe('dos equipos alternan Mañana/Tarde y cambian los lunes', () => {
	const rot = prensas();

	it('la semana de referencia A está en Mañana y B en Tarde; la siguiente, al revés', () => {
		expect(teamShift(rot, 0, '2026-11-04')).toBe(M);
		expect(teamShift(rot, 1, '2026-11-04')).toBe(T);
		expect(teamShift(rot, 0, '2026-11-09')).toBe(T);
		expect(teamShift(rot, 0, '2026-10-26')).toBe(T); // semana anterior
	});

	it('el cambio cae el lunes, no a mitad de semana', () => {
		const rows = planRotation(rot, '2026-11-06', '2026-11-09');
		expect(who(rows, '2026-11-06')).toEqual(['carlos:manana', 'luis:tarde']); // viernes
		expect(who(rows, '2026-11-09')).toEqual(['carlos:tarde', 'luis:manana']); // lunes
	});

	it('el sábado lo trabaja sólo el equipo de Mañana de esa semana; el domingo nadie', () => {
		const rows = planRotation(rot, '2026-11-07', '2026-11-15');
		expect(who(rows, '2026-11-07')).toEqual(['carlos:manana']);
		expect(who(rows, '2026-11-14')).toEqual(['luis:manana']);
		expect(who(rows, '2026-11-08')).toEqual([]);
	});

	it('sin regla de sábado, el sábado no se trabaja', () => {
		expect(who(planRotation(prensas({ saturday_shift_id: null }), '2026-11-07', '2026-11-07'), '2026-11-07')).toEqual([]);
	});

	it('la tarjeta resume la semana', () => {
		const w = describeWeek(rot, '2026-11-04');
		expect(w.teams.map((t) => `${t.team.name}:${t.shiftId}:${t.saturday}`)).toEqual(['Equipo A:manana:true', 'Equipo B:tarde:false']);
	});
});

describe('variaciones que el mismo modelo absorbe', () => {
	it('un guillotinero solo es un equipo de una persona', () => {
		const rot = prensas({
			teams: [
				{ id: 'r', name: 'Roberto', position: 0, members: [{ employee_id: 'roberto', machine_id: 'g1', role: 'Guillotina' }] },
				{ id: 'f', name: 'Felipe', position: 1, members: [{ employee_id: 'felipe', machine_id: 'g1', role: 'Guillotina' }] },
			],
		});
		expect(who(planRotation(rot, '2026-11-03', '2026-11-03'), '2026-11-03')).toEqual(['felipe:tarde', 'roberto:manana']);
	});

	it('turno fijo: un equipo, un turno, todas las semanas', () => {
		const rot = prensas({ shift_ids: ['taller'], saturday_shift_id: null, teams: [prensas().teams[0]] });
		expect(teamShift(rot, 0, '2026-11-04')).toBe('taller');
		expect(teamShift(rot, 0, '2027-03-10')).toBe('taller');
	});

	it('tres equipos sobre dos turnos: cada semana uno descansa', () => {
		const rot = prensas({ teams: [...prensas().teams, { id: 'C', name: 'Equipo C', position: 2, members: [{ employee_id: 'ana', machine_id: 'ryobi2', role: 'Operador' }] }] });
		const week = (d: string) => [0, 1, 2].map((p) => teamShift(rot, p, d));
		// Cada equipo avanza un lugar por semana: A hace Mañana → Tarde → descansa.
		expect(week('2026-11-04')).toEqual([M, T, null]);
		expect(week('2026-11-11')).toEqual([T, null, M]);
		expect(week('2026-11-18')).toEqual([null, M, T]);
	});

	it('tres equipos sobre Mañana/Tarde/Noche', () => {
		const rot = prensas({
			shift_ids: [M, T, N],
			saturday_shift_id: null,
			teams: [...prensas().teams, { id: 'C', name: 'Equipo C', position: 2, members: [{ employee_id: 'ana', machine_id: 'ryobi1', role: 'Operador' }] }],
		});
		expect([0, 1, 2].map((p) => teamShift(rot, p, '2026-11-11'))).toEqual([T, N, M]);
	});

	it('una rotación pausada no genera nada', () => {
		expect(planRotation(prensas({ active: false }), '2026-11-02', '2026-11-08')).toEqual([]);
	});
});

describe('validar antes de guardar', () => {
	it('una rotación bien armada no tiene problemas', () => {
		expect(validateRotation(prensas())).toEqual([]);
	});

	it('avisa lo que la haría imposible', () => {
		const problems = validateRotation(prensas({ teams: [prensas().teams[0]], saturday_shift_id: 'noche' }));
		expect(problems.join(' ')).toMatch(/2 turnos y 1 equipo/);
		expect(problems.join(' ')).toMatch(/turno del sábado/);
	});

	it('una persona no puede estar en dos rotaciones activas a la vez', () => {
		const otra = prensas({ id: 'otra', name: 'Guillotinas' });
		expect(validateRotation(prensas(), [otra]).join(' ')).toMatch(/dos equipos/);
		expect(validateRotation(prensas(), [{ ...otra, active: false }])).toEqual([]);
	});
});

describe('qué escribir al generar', () => {
	const planned = planRotation(prensas(), '2026-11-02', '2026-11-04'); // carlos y luis, lun–mié
	const base = { planned, rotationIds: ['rot'], skips: [], leaves: [] };

	it('reemplaza lo que la misma rotación generó antes, y nada más', () => {
		const r = decideRotationWrites({
			...base,
			existing: [
				{ id: 'viejo', employee_id: 'carlos', date: '2026-11-02', source: 'rotacion', rotation_id: 'rot' },
				{ id: 'otra', employee_id: 'carlos', date: '2026-11-03', source: 'rotacion', rotation_id: 'otra-rot' },
			],
		});
		expect(r.remove).toEqual(['viejo']);
		// El turno de otra rotación ese día cuenta como ocupado: no se duplica a Carlos.
		expect(r.skipped.map((s) => `${s.employee_id}:${s.date}:${s.reason}`)).toEqual(['carlos:2026-11-03:manual']);
		expect(r.insert).toHaveLength(5);
	});

	it('un cambio a mano, un turno quitado o una licencia mandan sobre la rotación', () => {
		const r = decideRotationWrites({
			...base,
			existing: [{ id: 'm', employee_id: 'luis', date: '2026-11-02', source: 'manual' }],
			skips: [{ rotation_id: 'rot', employee_id: 'carlos', date: '2026-11-03' }],
			leaves: [{ employee_id: 'luis', start_date: '2026-11-04', end_date: '2026-11-10' }],
		});
		expect(r.skipped.map((s) => `${s.employee_id}:${s.date}:${s.reason}`).sort()).toEqual([
			'carlos:2026-11-03:quitado',
			'luis:2026-11-02:manual',
			'luis:2026-11-04:licencia',
		]);
		expect(r.insert.map((p) => p.date)).toEqual([...r.insert.map((p) => p.date)].sort());
	});
});
