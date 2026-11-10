import { describe, expect, it } from 'vitest';
import { resolveCostOverrides, stageMachineRate, type CostSpec } from '../costing-resolver';
import { DEFAULT_COSTS } from '../ot-calculations';
import { inferProductionCosts } from '../whatsapp-cost-inference';
import type { CostCenterItem } from '@/types/work-category';

// El catálogo vivo (2026-11-05), recortado a lo que toca la prueba.
const row = (catalog_key: string | null, name: string, unit: string, unit_cost: number, category = 'impresion') =>
	({ id: name, catalog_key, name, unit, unit_cost, category, is_active: true }) as unknown as CostCenterItem;
const catalog = [
	row('offset_1c', 'Offset 1 Color', 'hrs', 35000),
	row('offset_2c', 'Offset 2 Colores', 'hrs', 55000),
	row('offset_4c', 'Offset 4 Colores', 'hrs', 85000),
	row('corte_guillotina', 'Corte Final (Guillotina)', 'hrs', 18000),
	row('troquelado', 'Troquelado', 'hrs', 25000),
	row('tinta_cmyk', 'Tinta Offset CMYK', 'kg', 31915),
	row(null, 'Adhesivo 90 grs', 'kg', 3500, 'papel'),
];
// OT 41221: CMYK + Pantone sobre adhesivo 90.
const spec41221: CostSpec = { color_front: 'cmyk_pantone', color_back: 'sin_impresion', substrate_type: 'adhesivo', grammage_gsm: 90 };

describe('C-1 · una tarifa por etapa, la de la cotización', () => {
	it('la hora de offset de 41221 es la misma que cotiza el motor', () => {
		const quoted = resolveCostOverrides(catalog, spec41221).offset_print_per_hour;
		expect(quoted).toBe(85000);
		expect(stageMachineRate('offset_printing', spec41221, catalog, DEFAULT_COSTS)).toEqual({ rate: 85000, label: 'Impresión offset', source: 'catalogo' });
	});

	it('2 colores cotiza y valoriza a la tarifa de 2 colores', () => {
		const dos = { ...spec41221, color_front: '2_color' };
		expect(stageMachineRate('offset_printing', dos, catalog, DEFAULT_COSTS)?.rate).toBe(55000);
	});

	it('guillotina y troquel salen del catálogo; sin catálogo, el defecto del motor marcado como supuesto', () => {
		expect(stageMachineRate('guillotine_first_cut', spec41221, catalog, DEFAULT_COSTS)?.rate).toBe(18000);
		expect(stageMachineRate('die_cutting', spec41221, catalog, DEFAULT_COSTS)?.rate).toBe(25000);
		expect(stageMachineRate('die_cutting', spec41221, [], DEFAULT_COSTS)).toMatchObject({ rate: DEFAULT_COSTS.troquelado_per_hour, source: 'supuesto' });
	});

	it('las etapas sin máquina por hora no tienen tarifa (el operario viene de los turnos)', () => {
		for (const stage of ['workshop', 'workshop_revision', 'digital_printing', 'in_delivery', 'pre_press']) {
			expect(stageMachineRate(stage, spec41221, catalog, DEFAULT_COSTS)).toBeNull();
		}
	});
});

describe('C-2 + material al consumo · el parte no tarifa tiempo ni material', () => {
	const parsed = {
		merma: 40, buenos: null, confidence: 70, hours_reported: 6, unparsed_notes: '', paper_mentioned: 'adhesivo',
		colors_mentioned: '4/0', pliegos_produced: 500, machine_mentioned: null, problems_reported: [], processes_mentioned: ['troquelado', 'doblado'],
	} as never;

	it('un parte de offset no trae ninguna línea: ni horas, ni papel, ni tinta', () => {
		const out = inferProductionCosts(parsed, 360, { ot_number: '41221', grammage_gsm: 90 }, resolveCostOverrides(catalog, spec41221));
		expect(out.cost_lines).toEqual([]);
		expect(out.paper_cost + out.ink_cost + out.total_inferred_cost).toBe(0);
	});

	it('tampoco clics de digital: son máquina, y la máquina se registra al cerrar la pasada', () => {
		const digital = { ...(parsed as object), machine_mentioned: 'digital' } as never;
		const out = inferProductionCosts(digital, null, { ot_number: '41221' }, { digital_click: 90 });
		expect(out.cost_lines).toEqual([]);
		expect(out.running_time_hours).toBeGreaterThan(0);
	});
});
