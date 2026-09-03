import { describe, expect, it } from 'vitest';

import { sheetShortfall } from '../spec-delta';

describe('sheetShortfall', () => {
	it('la diferencia cuando lo actual supera lo planeado', () => {
		expect(sheetShortfall(1500, 1000)).toBe(500);
	});

	it('cero cuando alcanza o sobra — nunca negativo', () => {
		expect(sheetShortfall(1000, 1000)).toBe(0);
		expect(sheetShortfall(800, 1000)).toBe(0);
	});

	it('trata null/undefined como cero de cada lado', () => {
		expect(sheetShortfall(500, null)).toBe(500);
		expect(sheetShortfall(null, 500)).toBe(0);
		expect(sheetShortfall(undefined, undefined)).toBe(0);
	});

	it('redondea al pliego entero', () => {
		expect(sheetShortfall(1000.6, 1000)).toBe(1);
		expect(sheetShortfall(1000.4, 1000)).toBe(0);
	});
});
