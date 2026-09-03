import { describe, expect, it } from 'vitest';

import {
	proposeRequirements,
	stageState,
	stageSummary,
	suggestExtraPaper,
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

	// El troquelado es un paso de producción que hace el propio taller, igual
	// que Plegado o Barniz — ninguno de esos genera un requisito de Compras, y
	// el troquel tampoco debería. La decisión de si hace falta un troquel
	// nuevo ya se toma en Pre-Prensa (TroquelDelEstante), con las medidas de
	// la pieza en mano; repetirla acá confundía una decisión de herramental
	// con una compra de material (auditoría 2026-08).
	it('el troquelado no pide herramental — es un proceso, no una compra', () => {
		expect(proposeRequirements({ finishes: { finish_troquelado: true } }).some((x) => x.kind === 'herramental')).toBe(false);
	});

	it('ningún trabajo pide herramental, troquelado o no', () => {
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

describe('suggestExtraPaper', () => {
	// Auditoría 2026-09-03, OT 41242: una merma forzó comprar 500 pliegos más
	// y el requisito ya resuelto no lo reflejaba — nada avisaba del faltante.
	it('sugiere la diferencia cuando la OT pide más de lo ya cargado', () => {
		const reqs = [req({ quantity: 1000, status: 'resuelto', purchaseId: 'oc-1' })];
		const s = suggestExtraPaper(reqs, 1500);
		expect(s).not.toBeNull();
		expect(s?.quantity).toBe(500);
		expect(s?.kind).toBe('papel');
		expect(s?.source).toBe('comprar');
		expect(s?.status).toBe('pendiente');
	});

	it('no sugiere nada si ya alcanza o sobra', () => {
		const reqs = [req({ quantity: 1000, status: 'resuelto', purchaseId: 'oc-1' })];
		expect(suggestExtraPaper(reqs, 1000)).toBeNull();
		expect(suggestExtraPaper(reqs, 800)).toBeNull();
	});

	// Sin ningún requisito de papel cargado todavía, esto no es su pregunta —
	// eso ya lo cubre proposeRequirements al armar la lista desde cero.
	it('no sugiere nada si todavía no hay ningún requisito de papel', () => {
		expect(suggestExtraPaper([], 5000)).toBeNull();
		expect(suggestExtraPaper([req({ kind: 'envase', quantity: 10 })], 5000)).toBeNull();
	});

	// Dos filas de papel (p.ej. una repartida entre compra y bodega) se suman
	// antes de comparar — mirar sólo la primera subestimaría lo ya cubierto.
	it('suma varios requisitos de papel antes de comparar', () => {
		const reqs = [
			req({ quantity: 600, status: 'resuelto', purchaseId: 'oc-1' }),
			req({ quantity: 400, source: 'bodega', status: 'resuelto', lotId: 'lote-1' }),
		];
		expect(suggestExtraPaper(reqs, 1000)).toBeNull();
		expect(suggestExtraPaper(reqs, 1300)?.quantity).toBe(300);
	});

	it('nombra la descripción a partir del requisito existente', () => {
		const reqs = [req({ description: 'Couché 200g', quantity: 1000, status: 'resuelto', purchaseId: 'oc-1' })];
		expect(suggestExtraPaper(reqs, 1500)?.description).toBe('Couché 200g (adicional — la OT creció)');
	});
});
