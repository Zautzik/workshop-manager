import { describe, expect, it } from 'vitest';

import { aggregateMerma, bandFor, evaluateMerma } from '../merma';

describe('evaluateMerma', () => {
	it('la OT 40502 real: 62.000 pliegos con 900 de merma', () => {
		// El único trabajo vivo con cifras reportadas. 900 / 62.900 = 1,4%
		const v = evaluateMerma({ pliegos: 62000, merma: 900 });
		expect(v.wasted).toBe(900);
		expect(v.entered).toBe(62000);
		expect(v.rate).toBeCloseTo(0.0145, 4);
		expect(v.level).toBe('normal');
		expect(v.note).toBeNull();
	});

	it('se mide sobre el papel ENTRADO, no sobre el vendible', () => {
		// Dividir por los buenos daría 100% justo cuando hace falta representar
		// que se perdió la mitad.
		const v = evaluateMerma({ buenos: 500, merma: 500 });
		expect(v.entered).toBe(1000);
		expect(v.rate).toBe(0.5);
	});

	it('un trabajo perdido entero da 100%, no más', () => {
		// «45500, 5 horas, 8000 pliegos fallados»: todo lo que entró se perdió.
		const v = evaluateMerma({ merma: 8000, buenos: 0 });
		expect(v.rate).toBe(1);
		expect(v.level).toBe('critica');
	});

	it('el mismo porcentaje se juzga distinto según el tiraje', () => {
		// 8% en 500 pliegos son cuarenta hojas de arreglo: normal.
		// 8% en 100.000 es una máquina con un problema.
		const corto = evaluateMerma({ pliegos: 500, merma: 40 });
		const largo = evaluateMerma({ pliegos: 100000, merma: 8000 });
		expect(corto.rate).toBeCloseTo(largo.rate!, 6);
		expect(corto.level).toBe('normal');
		expect(largo.level).toBe('critica');
	});

	it('clasifica los tramos por tamaño de tiraje', () => {
		expect(bandFor(800)).toBe('corto');
		expect(bandFor(12000)).toBe('medio');
		expect(bandFor(80000)).toBe('largo');
	});

	it('reconcilia buenos + merma contra el total declarado', () => {
		// Si el operario declara menos pliegos que buenos+merma, gana la suma:
		// no puede haber entrado menos papel del que salió.
		const v = evaluateMerma({ pliegos: 100, buenos: 900, merma: 100 });
		expect(v.entered).toBe(1000);
	});

	it('sólo merma reportada significa que se perdió todo lo que entró', () => {
		// No es «sin datos»: es el mismo caso que los 8.000 fallados. Si lo único
		// que el operario reporta son pliegos perdidos, ésos son los que entraron.
		const v = evaluateMerma({ merma: 50 });
		expect(v.entered).toBe(50);
		expect(v.rate).toBe(1);
		expect(v.level).toBe('critica');
	});

	it('sin ninguna cifra no inventa una tasa', () => {
		const v = evaluateMerma({ merma: null, buenos: null, pliegos: null });
		expect(v.level).toBe('sin_datos');
		expect(v.rate).toBeNull();
		expect(v.note).toContain('No se reportaron pliegos');
	});

	it('cero merma es normal, no «sin datos»', () => {
		const v = evaluateMerma({ pliegos: 5000, merma: 0 });
		expect(v.rate).toBe(0);
		expect(v.level).toBe('normal');
	});

	it('la nota explica el tamaño contra el que se juzgó', () => {
		const v = evaluateMerma({ pliegos: 50000, merma: 4000 });
		expect(v.level).toBe('critica');
		expect(v.note).toContain('50.000');
		expect(v.note).toContain('8.0%');
	});
});

describe('aggregateMerma', () => {
	it('pondera por papel, no promedia porcentajes', () => {
		// Un tiraje de 100 con 50% de merma y uno de 100.000 con 1% no dan 25,5%.
		const v = aggregateMerma([
			{ pliegos: 100, merma: 50 },
			{ pliegos: 100000, merma: 1000 },
		]);
		expect(v.wasted).toBe(1050);
		expect(v.entered).toBe(100100);
		expect(v.rate).toBeCloseTo(0.0105, 4);
		// El promedio simple habría dado 25,5% — veinticinco veces más.
		expect(v.rate!).toBeLessThan(0.02);
	});

	it('lista vacía no revienta', () => {
		expect(aggregateMerma([]).level).toBe('sin_datos');
	});

	it('ignora las filas sin cifras sin contaminar el total', () => {
		const v = aggregateMerma([
			{ pliegos: 10000, merma: 200 },
			{ merma: null, buenos: null },
		]);
		expect(v.entered).toBe(10000);
		expect(v.rate).toBeCloseTo(0.02, 4);
	});
});
