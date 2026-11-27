import { describe, expect, it } from 'vitest';
import { ledgerCategory, recordCostCorrection } from '../cost-correction';

/**
 * La corrección manual del costo real (B7, decisión del dueño 2026-11-27).
 *
 * Regla del dueño (2026-11-10): el costo se registra cuando se consume. Papel,
 * máquina y mano de obra tienen dueño —el lote que salió, la pasada que se
 * cerró, el turno de Planta— y se corrigen ahí, no con una línea suelta. Lo
 * que no tiene otro dueño (un tercerizado, una terminación externa, un extra)
 * entra como corrección: al libro, con motivo, marcada como tal.
 */
function base(otStatus: string | null = 'workshop') {
	const filas: Record<string, unknown>[] = [];
	const db = {
		from: (t: string) => ({
			// La OT: existe (con su estado) o no. Lo demás del libro se prueba
			// contra la base en src/__tests__/correccion-de-costo.test.ts.
			select: () => ({
				eq: () => ({
					maybeSingle: async () => ({
						data: t === 'ots' && otStatus ? { id: OT, status: otStatus } : null,
						error: null,
					}),
				}),
			}),
			insert: (rows: Record<string, unknown>[]) => ({
				select: async () => {
					rows.forEach((r, i) => filas.push({ ...r, id: `l-${filas.length + i + 1}` }));
					return { data: rows.map((_, i) => ({ id: `l-${filas.length - rows.length + i + 1}` })), error: null };
				},
			}),
		}),
	};
	return { db, filas };
}

const OT = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';

describe('ledgerCategory', () => {
	it('traduce las categorías del diálogo al libro', () => {
		expect(ledgerCategory('tercerizado')).toBe('outsourced');
		expect(ledgerCategory('terminaciones')).toBe('finishing');
		expect(ledgerCategory('otros')).toBe('other');
		expect(ledgerCategory('materiales')).toBe('material');
		expect(ledgerCategory('impresion')).toBe('machine');
	});
});

describe('recordCostCorrection', () => {
	const tercerizado = { category: 'tercerizado', description: 'Laminado externo', quantity: 1, unit: 'servicio', unitCost: 85_000 };

	it('escribe al libro como costo real, marcado como corrección y con el motivo', async () => {
		const { db, filas } = base();
		const r = await recordCostCorrection(db as never, { otId: OT, actorId: ACTOR, reason: 'Factura del laminador llegó después', lines: [tercerizado] });
		expect(r).toEqual({ ok: true, ids: ['l-1'] });
		expect(filas).toHaveLength(1);
		expect(filas[0]).toMatchObject({
			ot_id: OT,
			kind: 'actual',
			category: 'outsourced',
			source: 'correccion',
			ref_type: 'correccion',
			quantity: 1,
			unit_cost: 85_000,
			recorded_by: ACTOR,
			notes: 'Factura del laminador llegó después',
		});
	});

	it('sin motivo no se corrige nada', async () => {
		const { db, filas } = base();
		const r = await recordCostCorrection(db as never, { otId: OT, actorId: ACTOR, reason: '  ', lines: [tercerizado] });
		expect(r.ok).toBe(false);
		expect(filas).toHaveLength(0);
	});

	it('papel, máquina y mano de obra se corrigen en su dueño, no con una línea', async () => {
		for (const [category, dice] of [
			['materiales', /lote/i],
			['impresion', /pasada/i],
			['mano_de_obra', /pasada|turno/i],
		] as const) {
			const { db, filas } = base();
			const r = await recordCostCorrection(db as never, {
				otId: OT,
				actorId: ACTOR,
				reason: 'corregir',
				lines: [{ ...tercerizado, category }],
			});
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error).toMatch(dice);
			expect(filas).toHaveLength(0);
		}
	});

	it('una OT que no existe es 404 y una terminada es 409; ninguna escribe', async () => {
		for (const [status, esperado] of [[null, 404], ['completed', 409]] as const) {
			const { db, filas } = base(status);
			const r = await recordCostCorrection(db as never, { otId: OT, actorId: ACTOR, reason: 'Factura tardía', lines: [tercerizado] });
			expect(r).toMatchObject({ ok: false, status: esperado });
			expect(filas).toHaveLength(0);
		}
	});

	it('una línea sin descripción, sin cantidad o con costo negativo se rechaza entera', async () => {
		for (const mala of [
			{ ...tercerizado, description: '' },
			{ ...tercerizado, quantity: 0 },
			{ ...tercerizado, unitCost: -1 },
		]) {
			const { db, filas } = base();
			const r = await recordCostCorrection(db as never, { otId: OT, actorId: ACTOR, reason: 'x motivo', lines: [tercerizado, mala] });
			expect(r.ok).toBe(false);
			expect(filas).toHaveLength(0);
		}
	});
});
