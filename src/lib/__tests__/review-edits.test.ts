import { describe, expect, it } from 'vitest';
import { toEditableData, toDraftLines, toCorrections, type DraftLine } from '../review-edits';

// El parte real de la OT 41221: «fin 41221 500 pliegos 6 horas», tal como lo
// guardó la inferencia vieja (papel, tinta, prensa), más un tercerizado.
const parsed = {
	merma: null, buenos: null, confidence: 70, hours_reported: 6, unparsed_notes: '500 pliegos 6 horas',
	pliegos_produced: 500, processes_mentioned: [], problems_reported: [],
};
const lines = [
	{ unit: 'kg', source: 'parsed', category: 'papel', quantity: 52.65, unit_cost: 1500, total_cost: 78975, description: 'adhesivo 90 grs (500 pliegos)' },
	{ unit: 'kg', source: 'inferred', category: 'tinta', quantity: 1.6, unit_cost: 31915, total_cost: 51064, description: 'Tinta (4 colores × 500 pliegos)' },
	{ unit: 'hrs', source: 'parsed', category: 'impresion', quantity: 6, unit_cost: 55000, total_cost: 330000, description: 'Tiempo de Prensa (offset 4 colores)' },
	{ unit: 'click', source: 'parsed', category: 'impresion', quantity: 500, unit_cost: 80, total_cost: 40000, description: 'Impresión Digital' },
	{ unit: 'un', source: 'parsed', category: 'terminaciones', quantity: 1, unit_cost: 25000, total_cost: 25000, description: 'Plastificado externo' },
] as const;

const setup = () => ({ data: toEditableData(parsed), draft: toDraftLines(lines.map((l) => ({ ...l }))) });

describe('Editar e Integrar', () => {
	it('material y máquina de un parte viejo no se ofrecen: entran por el consumo y la pasada', () => {
		const { draft } = setup();
		expect(draft.map((l) => l.description)).toEqual(['Plastificado externo']);
	});

	it('las correcciones llevan sólo lo editable, sin totales ni claves locales', () => {
		const { data, draft } = setup();
		const edited = { ...data, hours_reported: 7, pliegos_produced: 812.6, problems_reported: [' rodillo ', ''] };
		const extra: DraftLine = { ...draft[0], description: '', total_cost: 0, _key: 'x', _manual: true };
		const { data: d, costLines } = toCorrections(edited, [...draft, extra]);
		// El servidor fusiona con el parse original: acá no viaja `unparsed_notes`.
		expect(d).toMatchObject({ hours_reported: 7, pliegos_produced: 813, problems_reported: ['rodillo'] });
		expect(d).not.toHaveProperty('unparsed_notes');
		expect(costLines).toHaveLength(1);
		expect(costLines[0]).not.toHaveProperty('_key');
		expect(costLines[0]).not.toHaveProperty('total_cost');
	});

	it.each([
		['papel', 0],
		['tinta', 1],
		['horas de prensa', 2],
		['clics de digital', 3],
	])('una línea de %s que se cuele no viaja como «otros»', (_label, i) => {
		const colada: DraftLine = { ...lines[i], _key: 'c', _manual: true };
		expect(toCorrections(setup().data, [colada]).costLines).toHaveLength(0);
	});
});
