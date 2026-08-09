import { describe, expect, it } from 'vitest';

import {
	costPerThousand,
	marginPerPressHour,
	pricePerThousand,
	rankByPressHour,
	splitRunTime,
} from '../print-economics';

describe('costo por millar', () => {
	it('pone dos tirajes de tamaño distinto en la misma escala', () => {
		// Un total de $2.400.000 en 150.000 pliegos y uno de $95.000 en 5.000 no
		// se pueden comparar. Por millar sí: $16.000 contra $19.000.
		expect(costPerThousand({ cost: 2_400_000, sheets: 150_000 })).toBe(16_000);
		expect(costPerThousand({ cost: 95_000, sheets: 5_000 })).toBe(19_000);
	});

	it('la 40502 real: 62.000 pliegos', () => {
		expect(costPerThousand({ cost: 3_100_000, sheets: 62_000 })).toBe(50_000);
	});

	it('el precio también se expresa por millar — es como compara el cliente', () => {
		expect(pricePerThousand(6_263_040, 62_000)).toBeCloseTo(101_016.8, 1);
	});

	it('sin pliegos devuelve null, no cero', () => {
		// Cero haría parecer gratis un trabajo del que no se sabe el tamaño.
		expect(costPerThousand({ cost: 500_000, sheets: 0 })).toBeNull();
		expect(costPerThousand({ cost: 500_000, sheets: null })).toBeNull();
	});

	it('un costo de cero sí es cero, no «sin datos»', () => {
		expect(costPerThousand({ cost: 0, sheets: 10_000 })).toBe(0);
	});
});

describe('arreglo contra tiraje', () => {
	it('reparte las horas y calcula la proporción de arreglo', () => {
		const s = splitRunTime({ makeReadyHours: 1.5, runHours: 6 });
		expect(s.total).toBe(7.5);
		expect(s.makeReadyShare).toBeCloseTo(0.2, 4);
		expect(s.dominatedByMakeReady).toBe(false);
	});

	it('marca el tiraje corto donde el arreglo se come el trabajo', () => {
		// Dos horas de arreglo para media hora de corrida: es la razón por la que
		// un cliente de tirajes cortos factura mucho y deja poco.
		const s = splitRunTime({ makeReadyHours: 2, runHours: 0.5 });
		expect(s.makeReadyShare).toBeCloseTo(0.8, 4);
		expect(s.dominatedByMakeReady).toBe(true);
	});

	it('sin horas no inventa una proporción', () => {
		const s = splitRunTime({ makeReadyHours: null, runHours: null });
		expect(s.makeReadyShare).toBeNull();
		expect(s.dominatedByMakeReady).toBe(false);
	});
});

describe('margen por hora de prensa', () => {
	it('el caso que cambia la decisión: menos margen, mejor negocio', () => {
		// El trabajo grande deja el doble en total y la mitad por hora.
		const grande = marginPerPressHour({ revenue: 1_000_000, cost: 600_000, pressHours: 8 });
		const chico = marginPerPressHour({ revenue: 400_000, cost: 200_000, pressHours: 2 });

		expect(grande.margin).toBe(400_000);
		expect(chico.margin).toBe(200_000);
		// Por margen absoluto ganaría el grande…
		expect(grande.margin!).toBeGreaterThan(chico.margin!);
		// …y por hora de prensa conviene el chico.
		expect(grande.marginPerHour).toBe(50_000);
		expect(chico.marginPerHour).toBe(100_000);
		expect(chico.marginPerHour!).toBeGreaterThan(grande.marginPerHour!);
	});

	it('un trabajo a pérdida da margen por hora negativo, no null', () => {
		const v = marginPerPressHour({ revenue: 300_000, cost: 500_000, pressHours: 4 });
		expect(v.marginPerHour).toBe(-50_000);
	});

	it('sin costo real no reparte nada por hora', () => {
		// El mismo criterio que el resto de la app: costo cero no es margen 100%.
		const v = marginPerPressHour({ revenue: 6_263_040, cost: 0, pressHours: 7 });
		expect(v.marginPerHour).toBeNull();
		expect(v.reason).toContain('Sin costo real');
	});

	it('sin horas conserva el margen pero no lo divide', () => {
		const v = marginPerPressHour({ revenue: 1_000_000, cost: 600_000, pressHours: null });
		expect(v.margin).toBe(400_000);
		expect(v.marginPerHour).toBeNull();
		expect(v.reason).toContain('horas de máquina');
	});
});

describe('rankByPressHour', () => {
	it('ordena por lo que deja la hora de prensa, no por margen total', () => {
		const orden = rankByPressHour([
			{ revenue: 1_000_000, cost: 600_000, pressHours: 8 },  // 50.000/h
			{ revenue: 400_000, cost: 200_000, pressHours: 2 },    // 100.000/h
			{ revenue: 900_000, cost: 700_000, pressHours: 1 },    // 200.000/h
		]);
		expect(orden.map((o) => o.verdict.marginPerHour)).toEqual([200_000, 100_000, 50_000]);
		// El de mayor margen absoluto queda último: ocupa ocho horas de prensa.
		expect(orden[2].revenue).toBe(1_000_000);
	});

	it('los que no se pueden juzgar quedan al final, no como si valieran cero', () => {
		const orden = rankByPressHour([
			{ revenue: 500_000, cost: 0, pressHours: 3 },          // sin costo
			{ revenue: 400_000, cost: 200_000, pressHours: 2 },    // 100.000/h
			{ revenue: 300_000, cost: 400_000, pressHours: 2 },    // −50.000/h
		]);
		expect(orden[0].verdict.marginPerHour).toBe(100_000);
		expect(orden[1].verdict.marginPerHour).toBe(-50_000);
		expect(orden[2].verdict.marginPerHour).toBeNull();
	});

	it('lista vacía devuelve lista vacía', () => {
		expect(rankByPressHour([])).toEqual([]);
	});
});
