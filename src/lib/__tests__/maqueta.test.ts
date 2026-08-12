import { describe, expect, it } from 'vitest';

import {
	maquetaCost,
	maquetaCostLines,
	maquetaLoadByClient,
	maquetaLoss,
	type MaquetaRound,
} from '../maqueta';

/** Una vuelta típica: cuatro pliegos de cartulina, impresos en digital, dos horas de armado. */
const vuelta = (over: Partial<MaquetaRound> = {}): MaquetaRound => ({
	sheets: 4,
	costPerSheet: 490,      // 70×100 de 300 g a $2.800 el kilo
	digitalPerSheet: 595,   // el clic de la digital, del catálogo
	handHours: 2,
	hourlyRate: 6500,
	...over,
});

describe('lo que cuesta una maqueta', () => {
	it('descompone material, impresión y mano de obra', () => {
		const c = maquetaCost({ rounds: [vuelta()] });
		expect(c.material).toBe(1960);   // 4 × 490
		expect(c.printing).toBe(2380);   // 4 × 595
		expect(c.labor).toBe(13_000);    // 2 h × 6.500
		expect(c.total).toBe(17_340);
	});

	it('la mano de obra es la partida grande, no el papel', () => {
		// Es lo que hace que una maqueta sorprenda: cuatro pliegos de cartulina
		// no son nada, dos horas de alguien armándola a mano sí.
		const c = maquetaCost({ rounds: [vuelta()] });
		expect(c.labor).toBeGreaterThan(c.material + c.printing);
	});

	it('cada vuelta se paga entera', () => {
		const c = maquetaCost({ rounds: [vuelta(), vuelta(), vuelta()] });
		expect(c.rounds).toBe(3);
		expect(c.total).toBe(17_340 * 3);
		expect(c.perRound).toEqual([17_340, 17_340, 17_340]);
	});

	it('el troquel de muestra NO se repite entre vueltas', () => {
		// Se corta una vez y la segunda maqueta lo reutiliza. Multiplicarlo por
		// vuelta sería inventar un costo que el taller no pagó.
		const una = maquetaCost({ rounds: [vuelta()], sampleDieCost: 45_000 });
		const tres = maquetaCost({ rounds: [vuelta(), vuelta(), vuelta()], sampleDieCost: 45_000 });
		expect(una.tooling).toBe(45_000);
		expect(tres.tooling).toBe(45_000);
		expect(tres.total - una.total).toBe(17_340 * 2);
	});

	it('una vuelta sin impresión digital no inventa un clic', () => {
		const c = maquetaCost({ rounds: [vuelta({ digitalPerSheet: undefined })] });
		expect(c.printing).toBe(0);
		expect(c.total).toBe(1960 + 13_000);
	});

	it('sin maquetas el costo es cero, no null', () => {
		const c = maquetaCost({ rounds: [] });
		expect(c.total).toBe(0);
		expect(c.rounds).toBe(0);
	});

	it('los negativos y la basura no se cuelan como costo', () => {
		const c = maquetaCost({ rounds: [vuelta({ sheets: -3, handHours: NaN })] });
		expect(c.material).toBe(0);
		expect(c.labor).toBe(0);
	});
});

describe('cómo entra al ledger de la OT', () => {
	it('se descompone en categorías, no entra como un bulto', () => {
		// Un bulto llamado «maqueta» deja la pantalla de Estimado vs Real con una
		// diferencia sin explicación. Descompuesta se ve qué fue.
		const lineas = maquetaCostLines({ rounds: [vuelta()] });
		expect(lineas.map((l) => l.category)).toEqual(['material', 'machine', 'labor']);
	});

	it('la descripción dice de qué vuelta es', () => {
		const lineas = maquetaCostLines({ rounds: [vuelta(), vuelta()] });
		expect(lineas[0].description).toContain('1ª vuelta');
		expect(lineas.some((l) => l.description.includes('2ª vuelta'))).toBe(true);
	});

	it('las líneas suman exactamente el costo total', () => {
		const input = { rounds: [vuelta(), vuelta({ handHours: 3 })], sampleDieCost: 45_000 };
		const suma = maquetaCostLines(input).reduce((s, l) => s + l.total, 0);
		expect(suma).toBe(maquetaCost(input).total);
	});

	it('el troquel de muestra dice que no se repite', () => {
		const l = maquetaCostLines({ rounds: [vuelta()], sampleDieCost: 45_000 }).at(-1)!;
		expect(l.category).toBe('other');
		expect(l.description).toContain('no se repite');
	});
});

describe('lo que cuesta perder', () => {
	const trabajo = (nombre: string, cliente: string, perdido: boolean, vueltas = 1) => ({
		otNumber: nombre,
		clientName: cliente,
		abandoned: perdido,
		maqueta: maquetaCost({ rounds: Array(vueltas).fill(vuelta()) }),
	});

	it('separa lo que se pagó y nunca se cobró', () => {
		// Es el número que hoy no existe en ninguna parte: cuánto cuesta perder.
		const v = maquetaLoss([
			trabajo('41001', 'Viña Coirón', false),
			trabajo('41002', 'Cosmética Ilalén', true, 3),
			trabajo('41003', 'Viña Coirón', false),
		]);
		expect(v.lostJobs).toBe(1);
		expect(v.sunkCost).toBe(17_340 * 3);
		expect(v.totalCost).toBe(17_340 * 5);
		expect(v.sunkShare!).toBeCloseTo(0.6, 4);
		expect(v.note).toContain('no llegaron a correr');
	});

	it('cuando no se perdió nada no dice nada', () => {
		const v = maquetaLoss([trabajo('41001', 'Viña Coirón', false)]);
		expect(v.sunkCost).toBe(0);
		expect(v.note).toBeNull();
	});

	it('sin maquetas no inventa una proporción', () => {
		const v = maquetaLoss([{
			otNumber: '41001', clientName: 'X', abandoned: true,
			maqueta: maquetaCost({ rounds: [] }),
		}]);
		expect(v.sunkShare).toBeNull();
	});

	it('lista vacía no revienta', () => {
		expect(maquetaLoss([]).sunkShare).toBeNull();
	});
});

describe('qué cliente cuesta convencer', () => {
	it('ordena por lo que costó y expone las vueltas por trabajo', () => {
		// La cifra que corrige la lectura de rentabilidad por cliente: uno que
		// pide tres vueltas y aprueba a la tercera puede dejar menos que uno que
		// paga menos y aprueba a la primera.
		const carga = maquetaLoadByClient([
			{ otNumber: '1', clientName: 'Cosmética Ilalén', abandoned: false, maqueta: maquetaCost({ rounds: [vuelta(), vuelta(), vuelta()] }) },
			{ otNumber: '2', clientName: 'Cosmética Ilalén', abandoned: false, maqueta: maquetaCost({ rounds: [vuelta(), vuelta()] }) },
			{ otNumber: '3', clientName: 'Molinos Curalí', abandoned: false, maqueta: maquetaCost({ rounds: [vuelta()] }) },
		]);

		expect(carga[0].clientName).toBe('Cosmética Ilalén');
		expect(carga[0].jobs).toBe(2);
		expect(carga[0].rounds).toBe(5);
		expect(carga[0].roundsPerJob).toBe(2.5);
		expect(carga[1].roundsPerJob).toBe(1);
	});
});
