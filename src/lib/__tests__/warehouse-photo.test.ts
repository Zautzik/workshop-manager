import { describe, expect, it } from 'vitest';
import { replyForResolution, resolveWarehousePhoto } from '@/lib/warehouse-photo';

const LOTE = 'lot-1';

describe('resolveWarehousePhoto — la escalera de la certeza', () => {
	it('1 · la etiqueta que trae la OT gana sobre todo lo demás', () => {
		const r = resolveWarehousePhoto({
			lotId: LOTE,
			otNumberFromLabel: '40502',
			reservas: [{ ot_id: 'otra', ot_number: '40999', quantity: 100 }],
			esperando: [{ id: 'ot-a', ot_number: '40502', calc_sheets: 800 }],
		});
		expect(r.otId).toBe('ot-a');
		expect(r.source).toBe('etiqueta');
	});

	it('una etiqueta que nombra una OT desconocida no inventa nada', () => {
		// Etiqueta vieja reusada: es justo el error que hay que atrapar.
		const r = resolveWarehousePhoto({ lotId: LOTE, otNumberFromLabel: '39999' });
		expect(r.otId).toBeNull();
		expect(r.question).toBeTruthy();
	});

	it('2 · una reserva viva resuelve sola, con su cantidad', () => {
		const r = resolveWarehousePhoto({
			lotId: LOTE,
			reservas: [{ ot_id: 'ot-a', ot_number: '40502', quantity: 4050 }],
		});
		expect(r.otId).toBe('ot-a');
		expect(r.quantity).toBe(4050);
		expect(r.source).toBe('reserva');
	});

	it('dos reservas sobre el mismo pallet se preguntan, no se adivinan', () => {
		const r = resolveWarehousePhoto({
			lotId: LOTE,
			reservas: [
				{ ot_id: 'a', ot_number: '40502', quantity: 100 },
				{ ot_id: 'b', ot_number: '40503', quantity: 200 },
			],
		});
		expect(r.otId).toBeNull();
		expect(r.question).toContain('2 órdenes');
		expect(r.candidates.map((c) => c.ot_number)).toEqual(['40502', '40503']);
	});

	it('3 · un requisito de compras que apunta al lote', () => {
		const r = resolveWarehousePhoto({
			lotId: LOTE,
			requisitos: [{ ot_id: 'ot-c', ot_number: '40777', quantity: 600, status: 'pendiente' }],
		});
		expect(r.otId).toBe('ot-c');
		expect(r.source).toBe('requisito');
	});

	it('un requisito ya resuelto no espera nada', () => {
		const r = resolveWarehousePhoto({
			lotId: LOTE,
			requisitos: [{ ot_id: 'ot-c', ot_number: '40777', quantity: 600, status: 'resuelto' }],
		});
		expect(r.otId).toBeNull();
	});

	it('4 · una sola OT esperando papel es una respuesta', () => {
		const r = resolveWarehousePhoto({
			lotId: LOTE,
			esperando: [{ id: 'ot-d', ot_number: '40888', calc_sheets: 1200 }],
		});
		expect(r.otId).toBe('ot-d');
		expect(r.quantity).toBe(1200);
		expect(r.source).toBe('unica_esperando');
	});

	it('varias esperando se preguntan, ofreciendo como mucho seis', () => {
		const r = resolveWarehousePhoto({
			lotId: LOTE,
			esperando: Array.from({ length: 30 }, (_, i) => ({ id: `o${i}`, ot_number: `41${i}` })),
		});
		expect(r.otId).toBeNull();
		// Una lista de treinta números no es una pregunta, es un formulario.
		expect(r.candidates).toHaveLength(6);
	});

	it('sin nada que consultar, pide el número de OT', () => {
		const r = resolveWarehousePhoto({ lotId: LOTE });
		expect(r.question).toContain('¿Para qué OT sale?');
	});

	it('la reserva manda sobre el requisito', () => {
		const r = resolveWarehousePhoto({
			lotId: LOTE,
			reservas: [{ ot_id: 'res', ot_number: '1', quantity: 10 }],
			requisitos: [{ ot_id: 'req', ot_number: '2', quantity: 20, status: 'pendiente' }],
		});
		expect(r.otId).toBe('res');
	});
});

describe('resolveWarehousePhoto — la cantidad', () => {
	it('nunca propone más de lo que hay en el pallet', () => {
		const r = resolveWarehousePhoto({
			lotId: LOTE,
			available: 300,
			reservas: [{ ot_id: 'a', ot_number: '1', quantity: 4050 }],
		});
		expect(r.quantity).toBe(300);
	});

	it('sin cantidad conocida no inventa una', () => {
		const r = resolveWarehousePhoto({
			lotId: LOTE,
			available: 300,
			reservas: [{ ot_id: 'a', ot_number: '1', quantity: null }],
		});
		expect(r.quantity).toBeNull();
	});
});

describe('replyForResolution — lo que se lee de pie', () => {
	it('dice el lote, la OT, por qué esa y cuánto', () => {
		const r = resolveWarehousePhoto({
			lotId: LOTE,
			reservas: [{ ot_id: 'a', ot_number: '40502', quantity: 4050 }],
		});
		const m = replyForResolution(r, 'OC-00021-L231814');
		expect(m).toContain('OC-00021-L231814');
		expect(m).toContain('OT 40502');
		expect(m).toContain('estaba reservado');
		expect(m).toContain('4.050 pliegos');
	});

	// El «por qué» está para que se pueda desmentir: si el pallet no es para
	// esa OT, quien lo lee tiene que poder darse cuenta ahí mismo.
	it('cuando pregunta, lista los números para contestar con uno', () => {
		const r = resolveWarehousePhoto({
			lotId: LOTE,
			esperando: [
				{ id: 'a', ot_number: '40502' },
				{ id: 'b', ot_number: '40503' },
			],
		});
		const m = replyForResolution(r, 'L-9');
		expect(m).toContain('¿Para cuál sale');
		expect(m).toContain('40502 · 40503');
	});

	// Estado que no es ni «pregunto» ni «sé todo»: hay una sola OT esperando
	// pero su calc_sheets todavía no se corrió, así que la OT se resuelve y la
	// cantidad no. Decir «descontando todo lo que haya» acá sería mentir — no
	// hay nada aplicado, y el mensaje tiene que decir eso, no sonar a éxito.
	it('OT resuelta sin cantidad no dice "descontando" — pide el número', () => {
		const r = resolveWarehousePhoto({
			lotId: LOTE,
			esperando: [{ id: 'a', ot_number: '40502', calc_sheets: null }],
		});
		expect(r.otId).toBe('a');
		expect(r.quantity).toBeNull();
		expect(r.question).toBeNull();

		const m = replyForResolution(r, 'L-9');
		expect(m).toContain('OT 40502');
		expect(m).not.toContain('Descontando');
		expect(m).toContain('no sé cuánto');
	});
});
