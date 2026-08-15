import { describe, expect, it } from 'vitest';

import {
	colorModeFromCount,
	handoffSummary,
	toWizardForm,
	type QuoteHandoff,
} from '../ot-handoff';

const COTIZACION: QuoteHandoff = {
	client_id: 'c1', client_name: 'Viña Coirón del Maule',
	product_name: 'Estuche de vino', product_type: 'caja_plegadiza',
	quantity: 120_000, width_cm: 12, height_cm: 34,
	grammage_gsm: 350, substrate_type: 'cartulina',
	colors_front: 4, colors_back: 0, coverage: 'heavy',
	finishes: { finish_troquelado: true, finish_pegado: true, finish_plegado: false },
	deadline: '2026-09-30', priority_level: 'alta', press_id: 'ryobi-1',
	markup: 35, precio_estimado: 14_500_000,
};

describe('los colores son un modo, no un número', () => {
	it('traduce la cantidad al modo del motor', () => {
		// El vendedor dice «4» por teléfono; el motor quiere «cmyk». La traducción
		// vive acá y no en la pantalla: si vive en un componente, el próximo
		// formulario la reescribe y se le olvida el pantone.
		expect(colorModeFromCount(0)).toBe('sin_impresion');
		expect(colorModeFromCount(1)).toBe('1_color');
		expect(colorModeFromCount(2)).toBe('2_color');
		expect(colorModeFromCount(3)).toBe('3_color');
		expect(colorModeFromCount(4)).toBe('cmyk');
	});

	it('cinco o más es cuatricromía con pantone', () => {
		expect(colorModeFromCount(5)).toBe('cmyk_pantone');
		expect(colorModeFromCount(7)).toBe('cmyk_pantone');
	});
});

describe('lo que se traspasa', () => {
	const f = toWizardForm(COTIZACION);

	it('lleva la ficha entera del nivel 1', () => {
		expect(f.client_id).toBe('c1');
		expect(f.quantity).toBe(120_000);
		expect(f.width_cm).toBe(12);
		expect(f.substrate_type).toBe('cartulina');
		expect(f.grammage_gsm).toBe(350);
		expect(f.deadline).toBe('2026-09-30');
		expect(f.priority_level).toBe('alta');
	});

	it('traduce los colores a modo', () => {
		expect(f.color_front).toBe('cmyk');
		expect(f.color_back).toBe('sin_impresion');
	});

	it('sólo pasa las terminaciones elegidas, no las apagadas', () => {
		expect(f.finishes.finish_troquelado).toBe(true);
		expect(f.finishes.finish_pegado).toBe(true);
		expect(f.finishes.finish_plegado).toBe(false);
		expect(f.finishes.finish_laminado).toBe(false);
	});

	it('elige la categoría del asistente según el producto', () => {
		expect(f.work_category).toBe('estuche');
		expect(toWizardForm({ ...COTIZACION, product_type: 'etiqueta' }).work_category).toBe('etiqueta');
	});

	it('un producto que el asistente no categoriza no inventa una categoría', () => {
		expect(toWizardForm({ ...COTIZACION, product_type: 'otro' }).work_category).toBeNull();
	});

	it('siembra el título de producción con el nombre del producto', () => {
		// El asistente lo llama «trabajo». Dejarlo vacío obligaría al vendedor a
		// reescribir algo que acaba de poner.
		expect(f.trabajo).toBe('Estuche de vino');
	});
});

describe('lo que NO se traspasa, y es a propósito', () => {
	it('el precio y el markup se quedan atrás', () => {
		// El asistente recalcula con montaje real, máquina asignada y operaciones
		// revisadas. Arrastrar el precio de la estimación haría que el número
		// viejo se vea como si fuera el nuevo.
		const f = toWizardForm(COTIZACION) as unknown as Record<string, unknown>;
		expect('markup' in f).toBe(false);
		expect('precio_estimado' in f).toBe(false);
		expect('pricing' in f).toBe(false);
	});
});

describe('el aviso puede decir cuánto se trajo', () => {
	it('cuenta los campos y las terminaciones', () => {
		const s = handoffSummary(COTIZACION);
		expect(s.campos).toBe(10);
		expect(s.terminaciones).toBe(2);
	});

	it('una cotización a medio llenar cuenta menos', () => {
		const s = handoffSummary({ ...COTIZACION, deadline: '', press_id: '', quantity: 0 });
		expect(s.campos).toBe(7);
	});
});

describe('la traducción aguanta una cotización incompleta', () => {
	it('no revienta con campos vacíos', () => {
		const f = toWizardForm({ finishes: {} } as unknown as QuoteHandoff);
		expect(f.client_id).toBe('');
		expect(f.color_front).toBe('sin_impresion');
		expect(f.ink_coverage).toBe('medium');
	});

	it('sin terminaciones deja todas apagadas, no indefinidas', () => {
		const f = toWizardForm({ ...COTIZACION, finishes: {} });
		expect(Object.values(f.finishes).every((v) => v === false)).toBe(true);
	});
});
