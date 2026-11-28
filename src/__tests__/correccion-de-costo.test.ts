/**
 * La corrección del costo real, contra la base de verdad (B7 de plan.md).
 *
 * Lo que protege, por las mismas rutas que usa el Tablero:
 *   - una corrección se anula con un asiento contrario, no se borra: las dos
 *     líneas quedan, cada una con su motivo, y el neto es cero;
 *   - se anula una sola vez, aunque dos lo intenten a la vez (índice único);
 *   - lo medido (papel, máquina, mano de obra) no se anula por acá;
 *   - una OT que no existe es 404, no un 500 de clave foránea;
 *   - una OT terminada ya cerró su costo: 409.
 *   - El análisis de costo cuenta el neto.
 *
 * No hay mocks del libro: el CHECK de cantidad, el índice único y el
 * disparador de «sólo cuando se consume» son los de la base.
 *
 * Escribe sólo contra el stack local, una OT ZZTEST que se borra al final.
 * Sin `TEST_SUPABASE_URL` se saltea. Se corre con `npm run test:integracion`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL_LOCAL = process.env.TEST_SUPABASE_URL ?? '';
const KEY_LOCAL = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? '';
const hayStack = Boolean(URL_LOCAL && KEY_LOCAL);

if (hayStack) {
	const host = new URL(URL_LOCAL).hostname;
	if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') {
		throw new Error(`TEST_SUPABASE_URL apunta a ${host}. Esta prueba escribe en el libro: sólo corre contra el stack local.`);
	}
	process.env.NEXT_PUBLIC_SUPABASE_URL = URL_LOCAL;
	process.env.SUPABASE_SERVICE_ROLE_KEY = KEY_LOCAL;
}

const sesion = { id: '' };
(globalThis as Record<string, unknown>).__correccionSesion = sesion;

vi.mock('@/lib/api-middleware', () => ({
	requireAuth: async () => {
		const s = (globalThis as Record<string, any>).__correccionSesion as { id: string };
		return { id: s.id, email: 'suite@local', name: 'Suite corrección', role: 'admin' };
	},
	isAuthError: (v: unknown) => v instanceof NextResponse,
}));

const db = hayStack ? createClient(URL_LOCAL, KEY_LOCAL, { auth: { persistSession: false } }) : (null as never);

type J = Record<string, any>;

async function llamar(mod: Promise<J>, metodo: 'GET' | 'POST', url: string, cuerpo: unknown, params: Record<string, string>) {
	const req = new NextRequest(new URL(`http://localhost${url}`), {
		method: metodo,
		...(cuerpo !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) } : {}),
	});
	const res: Response = await (await mod)[metodo](req, { params: Promise.resolve(params) });
	return { status: res.status, json: (await res.json().catch(() => ({}))) as J };
}

const corregir = (otId: string, cuerpo: unknown) =>
	llamar(import('@/app/api/ots/[id]/cost-corrections/route'), 'POST', `/api/ots/${otId}/cost-corrections`, cuerpo, { id: otId });
const anular = (otId: string, lineId: string, cuerpo: unknown) =>
	llamar(
		import('@/app/api/ots/[id]/cost-corrections/[lineId]/reverse/route'),
		'POST',
		`/api/ots/${otId}/cost-corrections/${lineId}/reverse`,
		cuerpo,
		{ id: otId, lineId },
	);

describe.skipIf(!hayStack)('corrección del costo real (base local)', () => {
	let otId = '';
	let correccionId = '';
	const marca = `ZZTEST-COR-${Date.now()}`;

	beforeAll(async () => {
		const { data: admin } = await db.from('user_roles').select('user_id').eq('role', 'admin').limit(1).single();
		sesion.id = (admin as { user_id: string }).user_id;
		const { data: ot, error } = await db
			.from('ots')
			.insert({ ot_number: marca, client_name: 'ZZTEST cliente', status: 'workshop' })
			.select('id')
			.single();
		if (error) throw error;
		otId = (ot as { id: string }).id;
	});

	afterAll(async () => {
		if (!otId) return;
		await db.from('ot_cost_lines').delete().eq('ot_id', otId);
		await db.from('ot_status_history').delete().eq('ot_id', otId);
		const { error } = await db.from('ots').delete().eq('id', otId);
		if (error) console.warn(`limpieza ots: ${error.message}`);
	});

	it('una OT que no existe es 404, no un error de clave foránea', async () => {
		const r = await corregir('00000000-0000-4000-8000-000000000000', {
			reason: 'flete no cobrado',
			lines: [{ category: 'tercerizado', description: 'Flete', quantity: 1, unit: 'servicio', unit_cost: 1000 }],
		});
		expect(r.status).toBe(404);
	});

	it('registra una corrección con su motivo', async () => {
		const r = await corregir(otId, {
			reason: 'el barniz UV lo hizo el proveedor externo',
			lines: [{ category: 'tercerizado', description: 'Barniz UV externo', quantity: 2, unit: 'servicio', unit_cost: 30_000 }],
		});
		expect(r.status).toBe(201);
		correccionId = r.json.ids[0];
	});

	it('anularla sin motivo no se puede', async () => {
		expect((await anular(otId, correccionId, { reason: '' })).status).toBe(400);
	});

	it('se anula con un asiento contrario: las dos líneas quedan y el neto es cero', async () => {
		const r = await anular(otId, correccionId, { reason: 'se cargó a la OT equivocada' });
		expect(r.status).toBe(201);

		const { data: lineas } = await db
			.from('ot_cost_lines')
			.select('id, source, ref_type, ref_id, quantity, total, notes')
			.eq('ot_id', otId)
			.order('created_at');
		expect(lineas).toHaveLength(2);
		const [orig, contra] = lineas as J[];
		expect(orig.id).toBe(correccionId);
		expect(Number(orig.total)).toBe(60_000);
		expect(contra.source).toBe('anulacion');
		expect(contra.ref_type).toBe('correccion');
		expect(contra.ref_id).toBe(correccionId);
		expect(Number(contra.quantity)).toBe(-2);
		expect(Number(contra.total)).toBe(-60_000);
		expect(contra.notes).toBe('se cargó a la OT equivocada');
	});

	it('anular otra vez la misma es 409', async () => {
		expect((await anular(otId, correccionId, { reason: 'otra vez' })).status).toBe(409);
	});

	it('se anula una sola vez, aunque dos lo intenten a la vez', async () => {
		const otra = await corregir(otId, {
			reason: 'troquel externo',
			lines: [{ category: 'terminaciones', description: 'Troquelado externo', quantity: 1, unit: 'servicio', unit_cost: 40_000 }],
		});
		expect(otra.status).toBe(201);
		const id = otra.json.ids[0];
		const [a, b] = await Promise.all([anular(otId, id, { reason: 'duplicada' }), anular(otId, id, { reason: 'duplicada' })]);
		expect([a.status, b.status].sort()).toEqual([201, 409]);
		const { count } = await db
			.from('ot_cost_lines')
			.select('id', { count: 'exact', head: true })
			.eq('ref_id', id)
			.eq('source', 'anulacion');
		expect(count).toBe(1);
	});

	it('una anulación no se anula, y lo medido tampoco', async () => {
		const { data: contra } = await db.from('ot_cost_lines').select('id').eq('ref_id', correccionId).eq('source', 'anulacion').single();
		expect((await anular(otId, (contra as J).id, { reason: 'deshacer la anulación' })).status).toBe(404);
	});

	it('la base no acepta una cantidad negativa suelta, ni que diga ser anulación sin apuntar a nada', async () => {
		const { error } = await db.from('ot_cost_lines').insert({
			ot_id: otId, kind: 'actual', category: 'outsourced', description: 'ZZTEST negativo',
			quantity: -1, unit: 'servicio', unit_cost: 1000, source: 'anulacion', ref_type: 'correccion',
		});
		expect(error?.code).toBe('23514');
	});

	it('el análisis de costo cuenta el neto: la corrección anulada suma cero', async () => {
		const r = await llamar(import('@/app/api/ots/[id]/cost-analysis/route'), 'GET', `/api/ots/${otId}/cost-analysis`, undefined, { id: otId });
		expect(r.status).toBe(200);
		expect(r.json.summary.total_actual).toBe(0);
		expect(r.json.summary.corrections_total).toBe(0);
		for (const cat of ['outsourced', 'finishing']) {
			const item = (r.json.line_items as J[]).find((i) => i.category === cat)!;
			expect(item.actual_cost).toBe(0);
			expect(item.actual_quantities).toEqual([]);
		}
	});

	it('una OT terminada ya cerró su costo: ni se corrige ni se anula', async () => {
		const nueva = await corregir(otId, {
			reason: 'flete de despacho',
			lines: [{ category: 'otros', description: 'Flete', quantity: 1, unit: 'servicio', unit_cost: 5000 }],
		});
		expect(nueva.status).toBe(201);
		const { error } = await db.from('ots').update({ status: 'completed' }).eq('id', otId);
		expect(error).toBeNull();

		const r = await corregir(otId, {
			reason: 'tarde',
			lines: [{ category: 'otros', description: 'Extra', quantity: 1, unit: 'servicio', unit_cost: 5000 }],
		});
		expect(r.status).toBe(409);
		expect((await anular(otId, nueva.json.ids[0], { reason: 'tarde' })).status).toBe(409);
	});
});
