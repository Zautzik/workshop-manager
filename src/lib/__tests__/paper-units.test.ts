import { describe, expect, it } from 'vitest';

import {
	SHEETS_PER_REAM,
	costPerKg,
	costPerSheet,
	kgFromSheets,
	pressHoursForSheets,
	sheetAreaM2,
	sheetJobCost,
	sheetWeightKg,
	sheetsFromKg,
} from '../paper-units';

/** Pliego de imprenta estándar. */
const P70x100 = { widthCm: 70, heightCm: 100, gsm: 300 };
/** Pliego máximo de la Ryobi 524GS del taller: 370 × 520 mm. */
const RYOBI = { widthCm: 37, heightCm: 52, gsm: 300 };

describe('geometría del pliego', () => {
	it('un 70×100 mide 0,7 m²', () => {
		expect(sheetAreaM2(P70x100)).toBeCloseTo(0.7, 6);
	});

	it('un 70×100 de 300 g pesa 210 gramos', () => {
		expect(sheetWeightKg(P70x100)).toBeCloseTo(0.21, 6);
	});

	it('el pliego máximo de la Ryobi pesa 57,7 g al mismo gramaje', () => {
		// Mismo papel, mismo precio por kilo, casi cuatro veces menos por pliego.
		// Por eso la conversión no puede ser una constante.
		expect(sheetWeightKg(RYOBI)).toBeCloseTo(0.05772, 5);
	});

	it('kilos y pliegos son reversibles', () => {
		const sheets = sheetsFromKg(21, P70x100)!;
		expect(sheets).toBeCloseTo(100, 6);
		expect(kgFromSheets(sheets, P70x100)).toBeCloseTo(21, 6);
	});

	it('sin geometría devuelve null en vez de adivinar', () => {
		expect(sheetWeightKg({ widthCm: 0, heightCm: 100, gsm: 300 })).toBeNull();
		expect(sheetWeightKg({ widthCm: 70, heightCm: 100, gsm: 0 })).toBeNull();
	});
});

describe('costPerSheet — el precio de un pliego venga como venga', () => {
	it('desde $/kg usa el peso real del pliego', () => {
		// Cartulina 300 g a $2.800/kg, en 70×100 → 0,21 kg × 2.800 = $588
		expect(costPerSheet({ value: 2800, unit: 'kg' }, P70x100)).toBeCloseTo(588, 4);
	});

	it('desde $/resma divide por 500', () => {
		// Papel Bond 75 g a $12.500 la resma → $25 el pliego
		expect(costPerSheet({ value: 12500, unit: 'resma' }, { ...P70x100, gsm: 75 })).toBeCloseTo(25, 6);
		expect(SHEETS_PER_REAM).toBe(500);
	});

	it('respeta un paquete que no sean 500 pliegos', () => {
		expect(costPerSheet({ value: 1000, unit: 'resma' }, { ...P70x100, sheetsPerPackage: 250 })).toBe(4);
	});

	it('desde $/pliego se usa tal cual', () => {
		expect(costPerSheet({ value: 42, unit: 'pliego' }, P70x100)).toBe(42);
	});

	it('EL DEFECTO QUE ORIGINÓ ESTO: resma y kg ya no se confunden', () => {
		// «Papel Bond 75g 70×100» vale $12.500 la RESMA. El motor lo trataba como
		// $12.500 el KILO. Ahora cada unidad da un número distinto y correcto.
		const spec = { ...P70x100, gsm: 75 };
		const porResma = costPerSheet({ value: 12500, unit: 'resma' }, spec)!;
		const porKilo = costPerSheet({ value: 12500, unit: 'kg' }, spec)!;
		expect(porResma).toBeCloseTo(25, 6);
		expect(porKilo).toBeCloseTo(656.25, 4);
		// El error era de más de veinticinco veces en el mismo material.
		expect(porKilo / porResma).toBeGreaterThan(25);
	});

	it('«unit» no se adivina', () => {
		// Sin saber qué es una unidad de ese material, convertir sería inventar.
		expect(costPerSheet({ value: 100, unit: 'unit' }, P70x100)).toBeNull();
	});

	it('precio no positivo devuelve null', () => {
		expect(costPerSheet({ value: 0, unit: 'kg' }, P70x100)).toBeNull();
		expect(costPerSheet({ value: -5, unit: 'resma' }, P70x100)).toBeNull();
	});
});

describe('costPerKg — para comparar materiales entre sí', () => {
	it('una resma se puede expresar por kilo', () => {
		// 500 pliegos de 70×100 a 75 g pesan 26,25 kg; $12.500 la resma → $476/kg
		const spec = { ...P70x100, gsm: 75 };
		expect(costPerKg({ value: 12500, unit: 'resma' }, spec)).toBeCloseTo(476.19, 1);
	});

	it('un precio por kilo se devuelve intacto', () => {
		expect(costPerKg({ value: 2800, unit: 'kg' }, P70x100)).toBe(2800);
	});
});

describe('la otra mitad: la máquina', () => {
	it('usa la velocidad óptima, no la nominal', () => {
		// La Ryobi #1: nominal 10.000, óptima 7.500. Costear con la nominal
		// subestimaría las horas un 25%, y las horas son media cuenta.
		const h = pressHoursForSheets(15000, { optimalSheetsPerHour: 7500, nominalSheetsPerHour: 10000 });
		expect(h).toBe(2);
		const conNominal = pressHoursForSheets(15000, { nominalSheetsPerHour: 10000 });
		expect(conNominal).toBe(1.5);
		expect(h!).toBeGreaterThan(conNominal!);
	});

	it('cae a la nominal cuando no hay óptima', () => {
		expect(pressHoursForSheets(10000, { optimalSheetsPerHour: null, nominalSheetsPerHour: 10000 })).toBe(1);
	});

	it('sin velocidad no inventa horas', () => {
		expect(pressHoursForSheets(10000, {})).toBeNull();
	});
});

describe('sheetJobCost — las dos mitades se encuentran en el pliego', () => {
	it('suma material y máquina para un trabajo real', () => {
		// 15.000 pliegos de cartulina 300 g en la Ryobi, a $35.000/hora offset.
		const c = sheetJobCost({
			sheets: 15000,
			price: { value: 2800, unit: 'kg' },
			spec: RYOBI,
			speed: { optimalSheetsPerHour: 7500 },
			machineRatePerHour: 35000,
		});
		expect(c.machineHours).toBe(2);
		expect(c.machineCost).toBe(70000);
		expect(c.materialCost).toBeCloseTo(15000 * 2800 * 0.05772, 0);
		expect(c.total).toBeCloseTo(c.materialCost! + c.machineCost!, 6);
	});

	it('el mismo trabajo comprando por resma da otro costo de material, no otro de máquina', () => {
		const base = { sheets: 10000, spec: { ...P70x100, gsm: 90 }, speed: { optimalSheetsPerHour: 7500 }, machineRatePerHour: 35000 };
		const a = sheetJobCost({ ...base, price: { value: 1250, unit: 'kg' } });
		const b = sheetJobCost({ ...base, price: { value: 12500, unit: 'resma' } });
		expect(a.machineCost).toBe(b.machineCost);
		expect(a.materialCost).not.toBeCloseTo(b.materialCost!, 0);
	});

	it('si falta una mitad no entrega un total parcial', () => {
		// Un total que sólo trae el material parece un costo y no lo es.
		const c = sheetJobCost({
			sheets: 1000,
			price: { value: 2800, unit: 'kg' },
			spec: P70x100,
			speed: {},
			machineRatePerHour: 35000,
		});
		expect(c.materialCost).not.toBeNull();
		expect(c.machineCost).toBeNull();
		expect(c.total).toBeNull();
	});
});
