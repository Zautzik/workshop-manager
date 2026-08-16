import { describe, expect, it } from 'vitest';

import {
	proposeRequirements,
	stageState,
	stageSummary,
	whyNotResolved,
	type Requirement,
} from '../requirements';

const req = (extra: Partial<Requirement> = {}): Requirement => ({
	kind: 'papel',
	description: 'Cartulina 300 g',
	source: 'comprar',
	status: 'pendiente',
	...extra,
});

describe('proposeRequirements', () => {
	it('el papel nunca falta', () => {
		const r = proposeRequirements({ substrateType: 'Cartulina', grammageGsm: 300, sheets: 1200 });
		expect(r[0].kind).toBe('papel');
		expect(r[0].description).toBe('Cartulina 300 g');
		expect(r[0].quantity).toBe(1200);
	});

	// Cada pantone es un tarro que se pide aparte y llega cuando llega.
	// Agruparlos es cómo se termina esperando uno que nadie pidió.
	it('cada pantone es su propio requisito', () => {
		const r = proposeRequirements({ pantoneColors: ['485 C', '2945 C'] });
		const tintas = r.filter((x) => x.kind === 'tinta_especial');
		expect(tintas).toHaveLength(2);
		expect(tintas.map((t) => t.description)).toEqual(['Pantone 485 C', 'Pantone 2945 C']);
	});

	// Saber que falta un dato es mejor que no saberlo.
	it('un modo pantone sin códigos declara el hueco igual', () => {
		const r = proposeRequirements({ colorFront: 'cmyk_pantone' });
		expect(r.some((x) => x.description.includes('falta el código'))).toBe(true);
	});

	it('no duplica cuando el pantone sí está nombrado', () => {
		const r = proposeRequirements({ colorFront: 'cmyk_pantone', pantoneColors: ['485 C'] });
		expect(r.filter((x) => x.kind === 'tinta_especial')).toHaveLength(1);
	});

	// El polilaminado no es material: es un servicio de un tercero.
	it('el laminado nace para tercerizar, no para comprar', () => {
		const r = proposeRequirements({ finishes: { finish_laminado: true } });
		const s = r.find((x) => x.description === 'Polilaminado');
		expect(s?.kind).toBe('servicio');
		expect(s?.source).toBe('tercerizar');
	});

	it('reconoce la bandera con y sin prefijo', () => {
		expect(proposeRequirements({ finishes: { laminado: true } }).some((x) => x.description === 'Polilaminado')).toBe(true);
		expect(proposeRequirements({ finishes: { finish_hot_stamping: true } }).some((x) => x.description === 'Hot stamping')).toBe(true);
	});

	// El estante de troqueles y esta lista se construyeron el mismo día sin
	// conocerse: una OT troquelada tenía dos semanas de plazo que la etapa
	// encargada de conseguir cosas no sabía que existían.
	it('un trabajo troquelado necesita el troquel', () => {
		const r = proposeRequirements({ finishes: { finish_troquelado: true } });
		const t = r.find((x) => x.kind === 'herramental');
		expect(t).toBeTruthy();
		expect(t?.status).toBe('pendiente');
		expect(t?.notes).toContain('2 semanas');
	});

	// Si Pre-Prensa ya lo eligió del estante no hay nada que conseguir, y
	// mostrarlo pendiente enseña a ignorar la lista.
	it('el troquel ya elegido nace resuelto y apunta al estante', () => {
		const r = proposeRequirements({
			finishes: { finish_troquelado: true },
			dieSource: 'existente',
			dieCode: 'TR-104',
		});
		const t = r.find((x) => x.kind === 'herramental');
		expect(t?.status).toBe('resuelto');
		expect(t?.source).toBe('bodega');
		expect(t?.description).toBe('Troquel TR-104');
	});

	it('un trabajo sin troquelado no pide herramental', () => {
		expect(proposeRequirements({ finishes: {} }).some((x) => x.kind === 'herramental')).toBe(false);
	});

	it('las cajas de despacho se nombran sin inventar la cantidad', () => {
		const c = proposeRequirements({}).find((x) => x.kind === 'envase');
		expect(c).toBeTruthy();
		expect(c?.quantity ?? null).toBeNull();
	});

	// Proponer «bodega» sugeriría que hay stock. Decirle a alguien que ya tiene
	// el papel cuando no lo tiene es peor que hacerlo elegir.
	it('lo material nace «comprar», nunca «bodega»', () => {
		const r = proposeRequirements({ substrateType: 'Cartulina', pantoneColors: ['485 C'] });
		expect(r.filter((x) => x.source === 'bodega')).toHaveLength(0);
	});
});

describe('stageState', () => {
	it('sin requisitos no es «listo», es «no se sabe»', () => {
		const s = stageState([]);
		expect(s.sinCargar).toBe(true);
		expect(s.completo).toBe(false);
	});

	it('separa los tres caminos porque los hacen personas distintas', () => {
		const s = stageState([
			req({ source: 'comprar' }),
			req({ source: 'comprar' }),
			req({ source: 'bodega' }),
			req({ source: 'tercerizar' }),
			req({ source: 'comprar', status: 'resuelto' }),
		]);
		expect(s.porComprar).toBe(2);
		expect(s.porSacar).toBe(1);
		expect(s.porTercerizar).toBe(1);
		expect(s.resueltos).toBe(1);
	});

	it('«no aplica» no cuenta como pendiente ni como resuelto', () => {
		const s = stageState([req({ status: 'no_aplica' }), req({ status: 'resuelto' })]);
		expect(s.total).toBe(1);
		expect(s.completo).toBe(true);
	});

	it('completo sólo cuando no queda nada', () => {
		expect(stageState([req({ status: 'resuelto' }), req()]).completo).toBe(false);
		expect(stageState([req({ status: 'resuelto' })]).completo).toBe(true);
	});
});

describe('stageSummary', () => {
	it('dice qué falta, no cuántos', () => {
		const s = stageState([req({ source: 'comprar' }), req({ source: 'comprar' }), req({ source: 'bodega' })]);
		expect(stageSummary(s)).toBe('Falta comprar 2, sacar 1 de bodega.');
	});

	it('distingue «no se cargó» de «está todo»', () => {
		expect(stageSummary(stageState([]))).toContain('Todavía no se cargó');
		expect(stageSummary(stageState([req({ status: 'resuelto' })]))).toContain('Todo conseguido');
	});
});

describe('whyNotResolved', () => {
	it('comprar necesita la OC', () => {
		expect(whyNotResolved(req({ source: 'comprar' }))).toBe('Falta la orden de compra.');
		expect(whyNotResolved(req({ source: 'comprar', purchaseId: 'x' }))).toBeNull();
	});

	// Lo que estaba en bodega no lleva compra: lo cierra señalar el lote, que
	// además es lo que forma la trazabilidad hacia atrás.
	it('bodega necesita el lote, no una compra', () => {
		expect(whyNotResolved(req({ source: 'bodega' }))).toBe('Falta indicar de qué lote sale.');
		expect(whyNotResolved(req({ source: 'bodega', lotId: 'x' }))).toBeNull();
	});

	// Exigir una OC para un polilaminado de $40.000 termina con la etapa
	// marcada a mano y sin registro de nada.
	it('un servicio puede cerrarse sin documento', () => {
		expect(whyNotResolved(req({ source: 'tercerizar' }))).toBeNull();
	});
});
