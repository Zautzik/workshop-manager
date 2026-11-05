import { describe, expect, it } from 'vitest';
import { toEditableData, toDraftLines, rederive, toCorrections, type DraftLine } from '../review-edits';

// El parte real de la OT 41221: «fin 41221 500 pliegos 6 horas».
const parsed = {
	merma: null, buenos: null, confidence: 70, hours_reported: 6, unparsed_notes: '500 pliegos 6 horas',
	pliegos_produced: 500, processes_mentioned: [], problems_reported: [],
};
const lines = [
	{ unit: 'kg', source: 'parsed', category: 'papel', quantity: 52.65, unit_cost: 1500, total_cost: 78975, description: 'adhesivo 90 grs (500 pliegos)' },
	{ unit: 'kg', source: 'inferred', category: 'tinta', quantity: 1.6, unit_cost: 31915, total_cost: 51064, description: 'Tinta (4 colores × 500 pliegos)' },
	{ unit: 'hrs', source: 'parsed', category: 'impresion', quantity: 0, unit_cost: 55000, total_cost: 0, description: 'Tiempo de Prensa (offset 4 colores)' },
] as const;

const setup = () => {
	const baseData = toEditableData(parsed);
	const baseLines = toDraftLines(lines.map((l) => ({ ...l })));
	return { baseData, baseLines };
};

describe('Editar e Integrar', () => {
	it('corregir los pliegos arrastra papel y tinta, con su descripción', () => {
		const { baseData, baseLines } = setup();
		const out = rederive(baseLines, baseLines, baseData, { ...baseData, pliegos_produced: 1000 });
		expect(out[0].quantity).toBe(105.3);
		expect(out[0].total_cost).toBe(157950);
		expect(out[0].description).toBe('adhesivo 90 grs (1000 pliegos)');
		expect(out[1].quantity).toBe(3.2);
		expect(out[1].description).toBe('Tinta (4 colores × 1000 pliegos)');
	});

	it('la merma suma papel pero no tinta', () => {
		const { baseData, baseLines } = setup();
		const out = rederive(baseLines, baseLines, baseData, { ...baseData, merma: 100 });
		expect(out[0].description).toBe('adhesivo 90 grs (600 pliegos)');
		expect(out[1].quantity).toBe(1.6);
	});

	it('las horas NO se copian a las líneas en hrs (se valorizan en la pasada)', () => {
		const { baseData, baseLines } = setup();
		const out = rederive(baseLines, baseLines, baseData, { ...baseData, hours_reported: 8 });
		expect(out[2].quantity).toBe(0);
	});

	it('una línea tocada a mano no se pisa al corregir los pliegos', () => {
		const { baseData, baseLines } = setup();
		const manual: DraftLine[] = baseLines.map((l, i) => (i === 0 ? { ...l, quantity: 40, total_cost: 60000, _manual: true } : l));
		const out = rederive(manual, baseLines, baseData, { ...baseData, pliegos_produced: 1000 });
		expect(out[0].quantity).toBe(40);
		expect(out[1].quantity).toBe(3.2);
	});

	it('volver al dato original devuelve la línea original', () => {
		const { baseData, baseLines } = setup();
		const once = rederive(baseLines, baseLines, baseData, { ...baseData, pliegos_produced: 1000 });
		const back = rederive(once, baseLines, baseData, baseData);
		expect(back[0].quantity).toBe(52.65);
	});

	it('las correcciones llevan sólo lo editable, sin totales ni claves locales', () => {
		const { baseData, baseLines } = setup();
		const data = { ...baseData, hours_reported: 7, pliegos_produced: 812.6, problems_reported: [' rodillo ', ''] };
		const extra: DraftLine = { ...baseLines[0], description: '', total_cost: 0, _key: 'x', _manual: true };
		const { data: d, costLines } = toCorrections(data, [...baseLines, extra]);
		// El servidor fusiona con el parse original: acá no viaja `unparsed_notes`.
		expect(d).toMatchObject({ hours_reported: 7, pliegos_produced: 813, problems_reported: ['rodillo'] });
		expect(d).not.toHaveProperty('unparsed_notes');
		expect(costLines).toHaveLength(3);
		expect(costLines[0]).not.toHaveProperty('_key');
		expect(costLines[0]).not.toHaveProperty('total_cost');
	});
});
