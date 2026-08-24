import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/workstation-skills', () => ({
	isWorkerQualifiedForStation: vi.fn((worker: any, station: any) =>
		Boolean(worker?.qualifiedStations?.includes(station?.id))
	),
}));

import { isWorkerEligibleForStation, workerConflictFlags, workerSortScore } from '../worker-eligibility';

const station = { id: 'guillotina-1' };
const qualifiedWorker = { id: 'w1', qualifiedStations: ['guillotina-1'], overtime_availability: true };
const unqualifiedWorker = { id: 'w2', qualifiedStations: [], overtime_availability: true };

describe('workerConflictFlags', () => {
	it('sin workerId, todo se trata como conflicto (peor caso, no "sin dato")', () => {
		expect(workerConflictFlags(null, null, station, undefined)).toEqual({
			leaveConflict: true,
			legalConflict: true,
			missingSkill: false,
		});
	});

	it('marca leaveConflict solo cuando el indicador dice "alert"', () => {
		const flags = workerConflictFlags('w1', qualifiedWorker, station, { leaveTone: 'alert' });
		expect(flags.leaveConflict).toBe(true);
	});

	it('no marca leaveConflict con otros tonos', () => {
		const flags = workerConflictFlags('w1', qualifiedWorker, station, { leaveTone: 'ok' });
		expect(flags.leaveConflict).toBe(false);
	});

	it('marca missingSkill cuando la estación exige una competencia que falta', () => {
		const flags = workerConflictFlags('w2', unqualifiedWorker, station, undefined);
		expect(flags.missingSkill).toBe(true);
	});

	it('sin estación, no hay como evaluar la competencia', () => {
		const flags = workerConflictFlags('w2', unqualifiedWorker, null, undefined);
		expect(flags.missingSkill).toBe(false);
	});
});

describe('isWorkerEligibleForStation', () => {
	it('trabajador calificado y sin conflictos es elegible', () => {
		expect(isWorkerEligibleForStation(qualifiedWorker, station, false, undefined)).toBe(true);
	});

	it('sin la competencia requerida, no es elegible', () => {
		expect(isWorkerEligibleForStation(unqualifiedWorker, station, false, undefined)).toBe(false);
	});

	it('con conflicto legal de horas, no es elegible aunque esté calificado', () => {
		expect(isWorkerEligibleForStation(qualifiedWorker, station, false, { legalHourConflict: true })).toBe(false);
	});

	it('en sobretiempo, requiere disponibilidad de sobretiempo', () => {
		const noOvertime = { ...qualifiedWorker, overtime_availability: false };
		expect(isWorkerEligibleForStation(noOvertime, station, true, undefined)).toBe(false);
		expect(isWorkerEligibleForStation(qualifiedWorker, station, true, undefined)).toBe(true);
	});
});

describe('workerSortScore', () => {
	it('a igual costo, rating más alto puntúa mejor', () => {
		const bueno = workerSortScore({ overall_rating: 5 }, 5000, false);
		const malo = workerSortScore({ overall_rating: 1 }, 5000, false);
		expect(bueno).toBeGreaterThan(malo);
	});

	it('a igual rating, costo más bajo puntúa mejor', () => {
		const barato = workerSortScore({ overall_rating: 3 }, 3000, false);
		const caro = workerSortScore({ overall_rating: 3 }, 6000, false);
		expect(barato).toBeGreaterThan(caro);
	});

	it('sobretiempo penaliza el puntaje', () => {
		const normal = workerSortScore({ overall_rating: 3 }, 5000, false);
		const overtime = workerSortScore({ overall_rating: 3 }, 5000, true);
		expect(overtime).toBeLessThan(normal);
	});
});
