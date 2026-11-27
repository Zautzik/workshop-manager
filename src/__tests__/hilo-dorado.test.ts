/**
 * El hilo dorado de punta a punta (F1 de plan.md).
 *
 * Una OT recorre el camino real, por las mismas rutas que usan las pantallas:
 *
 *   cotizar → convertir (nace en Pre-Prensa) → completar la ficha → visto bueno
 *   → el cliente aprueba por el enlace (moveOT) → bodega → entra a la primera
 *   etapa (sale el papel) → cierra pasadas (Tablero y parte de WhatsApp
 *   revisado) → revisión de calidad → despacho → factura → completada
 *
 * y en cada paso se mira el libro, no la pantalla: el estado, la bitácora, el
 * stock del lote, las líneas de costo real. Lo que esta prueba protege es que
 * cada hecho tenga UN escritor: el material sale una vez y cuesta lo que costó
 * su lote; la máquina cuesta sólo con una pasada cerrada; nada de la
 * cotización se copia como costo real; cada movimiento queda una vez en la
 * bitácora.
 *
 * Escribe: sólo contra el stack local (dos candados, como
 * cierre-desde-la-etiqueta.test.ts), todo marcado ZZTEST y borrado al final.
 * Sin `TEST_SUPABASE_URL` se saltea: `npm test` y CI no la ven. Se corre con
 * `npm run test:integracion`.
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
		throw new Error(`TEST_SUPABASE_URL apunta a ${host}. Esta prueba crea y mueve una OT: sólo corre contra el stack local.`);
	}
	process.env.NEXT_PUBLIC_SUPABASE_URL = URL_LOCAL;
	process.env.SUPABASE_SERVICE_ROLE_KEY = KEY_LOCAL;
}

/**
 * Quien opera: un admin real de la base local (los movimientos de stock tienen
 * FK a auth.users). Se busca en beforeAll y el mock lo lee de acá.
 */
const sesion = { id: '' };
(globalThis as Record<string, unknown>).__hiloDoradoSesion = sesion;

vi.mock('@/lib/api-middleware', () => ({
	requireAuth: async (roles?: string | string[]) => {
		const rol = 'admin';
		if (roles) {
			const lista = Array.isArray(roles) ? roles : [roles];
			if (!lista.includes(rol)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
		}
		const s = (globalThis as Record<string, any>).__hiloDoradoSesion as { id: string };
		return { id: s.id, email: 'suite@local', name: 'Suite hilo dorado', role: rol };
	},
	isAuthError: (v: unknown) => v instanceof NextResponse,
}));

const db = hayStack ? createClient(URL_LOCAL, KEY_LOCAL, { auth: { persistSession: false } }) : (null as never);

type J = Record<string, any>;

/** Llama un handler como lo llamaría Next. */
async function llamar(
	mod: Promise<J>,
	metodo: 'GET' | 'POST' | 'PATCH',
	url: string,
	cuerpo?: unknown,
	params?: Record<string, string>,
): Promise<{ status: number; json: J }> {
	const handler = (await mod)[metodo];
	const req = new NextRequest(new URL(`http://localhost${url}`), {
		method: metodo,
		...(cuerpo !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) } : {}),
	});
	const res: Response = await handler(req, { params: Promise.resolve(params ?? {}) });
	const json = (await res.json().catch(() => ({}))) as J;
	return { status: res.status, json };
}

const PRECIO = 1_200_000;
const PLIEGOS = 1_000;
const COSTO_PLIEGO = 150; // el lote costó $150 el pliego

describe.skipIf(!hayStack)('hilo dorado: cotización → OT → producción → despacho → factura', () => {
	const marca = `ZZTEST-${Date.now()}`;
	let clienteId = '';
	let itemId = '';
	let loteId = '';
	let prensa = '';
	let vbId = '';
	let otId = '';
	let otNumero = '';
	const guias: string[] = [];
	const facturas: string[] = [];
	const logs: string[] = [];

	const ot = async () => {
		const { data, error } = await db.from('ots').select('*').eq('id', otId).single();
		if (error) throw new Error(error.message);
		return data as J;
	};
	const lineasReales = async () => {
		const { data, error } = await db
			.from('ot_cost_lines')
			.select('kind, category, ref_type, ref_id, quantity, unit_cost, total')
			.eq('ot_id', otId)
			.eq('kind', 'actual');
		if (error) throw new Error(error.message);
		return (data ?? []) as J[];
	};
	const mover = (to_status: string, extra: J = {}) =>
		llamar(import('@/app/api/ots/[id]/transition/route'), 'POST', `/api/ots/${otId}/transition`, { to_status, ...extra }, { id: otId });

	beforeAll(async () => {
		const { data: admin, error: ea } = await db.from('user_roles').select('user_id').eq('role', 'admin').limit(1).single();
		if (ea) throw new Error(`admin: ${ea.message}`);
		sesion.id = (admin as J).user_id;

		const { data: c, error: ec } = await db.from('clients').insert({ name: `${marca} Cliente` } as never).select('id').single();
		if (ec) throw new Error(`cliente: ${ec.message}`);
		clienteId = (c as J).id;

		const { data: m, error: em } = await db
			.from('machines')
			.select('id')
			.eq('type', 'offset_printer')
			.eq('is_active', true)
			.order('name')
			.limit(1)
			.single();
		if (em) throw new Error(`prensa: ${em.message}`);
		prensa = (m as J).id;

		// El papel: un ítem en pliegos y un lote con costo conocido. Es el dato de
		// entrada, no lo que se prueba — lo que se prueba es cómo sale.
		const { data: it, error: ei } = await db
			.from('inventory_items')
			.insert({
				sku: `${marca}-PAPEL`,
				name: `${marca} Couché 300 g 70x100`,
				category: 'product_input',
				material_kind: 'papel',
				unit: 'pliegos',
				grammage_gsm: 300,
				sheet_width_cm: 70,
				sheet_height_cm: 100,
				estimated_unit_cost: COSTO_PLIEGO,
				is_certification_required: false,
			} as never)
			.select('id')
			.single();
		if (ei) throw new Error(`ítem: ${ei.message}`);
		itemId = (it as J).id;

		const { data: lo, error: el } = await db
			.from('inventory_lots')
			.insert({
				item_id: itemId,
				lot_number: `${marca}-L1`,
				quantity_received: 5_000,
				quantity_available: 5_000,
				unit_cost: COSTO_PLIEGO,
			} as never)
			.select('id')
			.single();
		if (el) throw new Error(`lote: ${el.message}`);
		loteId = (lo as J).id;
	});

	afterAll(async () => {
		if (!hayStack) return;
		const borrar = async (tabla: string, col: string, ids: string[]) => {
			if (ids.length === 0 || ids.every((i) => !i)) return;
			const { error } = await db.from(tabla).delete().in(col, ids.filter(Boolean));
			if (error) console.warn(`limpieza ${tabla}: ${error.message}`);
		};
		await borrar('sales_invoices', 'id', facturas);
		await borrar('dispatch_guides', 'ot_id', [otId]);
		await borrar('capture_events', 'ot_id', [otId]);
		await borrar('whatsapp_production_logs', 'ot_id', [otId]);
		await borrar('domain_events', 'ot_id', [otId]);
		await borrar('inventory_stock_transactions', 'lot_id', [loteId]);
		await borrar('ots', 'id', [otId]);
		await borrar('vistos_buenos', 'id', [vbId]);
		await borrar('inventory_lots', 'id', [loteId]);
		await borrar('inventory_items', 'id', [itemId]);
		await borrar('clients', 'id', [clienteId]);
	});

	it('1. cotizar crea la OT, que nace en Pre-Prensa con lo cotizado', async () => {
		const vb = await llamar(import('@/app/api/vistos-buenos/route'), 'POST', '/api/vistos-buenos', {
			client_id: clienteId,
			client_name: `${marca} Cliente`,
			product_name: `${marca} Etiqueta`,
			product_type: 'etiqueta',
			quantity: 10_000,
			width_cm: 10,
			height_cm: 7,
			substrate_type: 'couche',
			grammage_gsm: 300,
			color_front: '4',
			color_back: '0',
			calc_sheets: PLIEGOS,
			calc_print_hours: 2,
			calc_finish_hours: 1,
			estimate_lines: [
				{ category: 'papel', description: 'Couché 300 g', quantity: PLIEGOS, unit: 'pliegos', unit_cost: 140 },
				{ category: 'impresion', description: 'Offset 4/0', quantity: 2, unit: 'horas', unit_cost: 85_000 },
			],
			subtotal_cost: 900_000,
			total_price: PRECIO,
			unit_price: PRECIO / 10_000,
			deadline: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
			press_id: prensa,
			status: 'draft',
		});
		expect(vb.status, JSON.stringify(vb.json)).toBe(200);
		vbId = vb.json.data.id;

		const conv = await llamar(
			import('@/app/api/vistos-buenos/[id]/convert/route'),
			'POST',
			`/api/vistos-buenos/${vbId}/convert`,
			undefined,
			{ id: vbId },
		);
		expect(conv.status, JSON.stringify(conv.json)).toBe(200);
		otId = conv.json.ot_id ?? conv.json.id ?? conv.json.data;
		expect(otId).toBeTruthy();

		const o = await ot();
		otNumero = o.ot_number;
		expect(o.status).toBe('pre_press');
		expect(Number(o.total_price)).toBe(PRECIO);
		expect(o.assigned_machine_id).toBe(prensa);

		// Lo cotizado vive en su carril: nada es costo real todavía.
		expect(await lineasReales()).toEqual([]);
	});

	it('2. Pre-Prensa completa la ficha y la OT pasa a visto bueno', async () => {
		// Sin la ficha completa, la compuerta nombra lo que falta.
		const antes = await mover('visto_bueno');
		expect(antes.status).toBe(400);
		expect(antes.json.code).toBe('SPEC_INCOMPLETE');

		const diseno = await llamar(import('@/app/api/ots/[id]/diseno/route'), 'POST', `/api/ots/${otId}/diseno`, { sinDiseno: true }, { id: otId });
		expect(diseno.status, JSON.stringify(diseno.json)).toBe(200);

		// El montaje se confirma programándola en la prensa (Planificación).
		const inicio = new Date(Date.now() + 2 * 86_400_000);
		const slot = await llamar(import('@/app/api/ot-schedule/route'), 'POST', '/api/ot-schedule', {
			ot_id: otId,
			machine_id: prensa,
			scheduled_start: inicio.toISOString(),
			scheduled_end: new Date(inicio.getTime() + 2 * 3_600_000).toISOString(),
			estimated_hours: 2,
			plan_step: 'offset',
		});
		expect(slot.status, JSON.stringify(slot.json)).toBeLessThan(300);

		const r = await mover('visto_bueno');
		expect(r.status, JSON.stringify(r.json)).toBe(200);
		expect((await ot()).status).toBe('visto_bueno');
	});

	it('3. el cliente aprueba por el enlace y la OT pasa a compra de papel por moveOT', async () => {
		const share = await llamar(import('@/app/api/ots/[id]/share/route'), 'POST', `/api/ots/${otId}/share`, {}, { id: otId });
		expect(share.status).toBe(200);
		const token = share.json.share_token as string;

		const apr = await llamar(
			import('@/app/api/track/[token]/approval/route'),
			'POST',
			`/api/track/${token}/approval`,
			{ decision: 'approved', approverName: 'Cliente de prueba', proofedOn: 'pdf' },
			{ token },
		);
		expect(apr.status, JSON.stringify(apr.json)).toBe(200);
		expect(apr.json.avanzo_a_compras).toBe(true);
		expect((await ot()).status).toBe('paper_purchase');

		// La bitácora la escribió moveOT, con el motivo del portal.
		const { data: h } = await db
			.from('ot_status_history')
			.select('from_status, to_status, reason')
			.eq('ot_id', otId)
			.eq('to_status', 'paper_purchase');
		expect(h).toEqual([{ from_status: 'visto_bueno', to_status: 'paper_purchase', reason: 'visto_bueno_portal' }]);
	});

	it('4. bodega, y al entrar a la primera etapa sale el papel una vez, al costo del lote', async () => {
		const bodega = await mover('in_storage');
		expect(bodega.status, JSON.stringify(bodega.json)).toBe(200);

		const { nextStatusOnRoute } = await import('@/lib/production-route');
		const { data: maquinas } = await db.from('machines').select('id, type');
		const tipos = new Map(((maquinas ?? []) as J[]).map((m) => [m.id, m.type]));
		const primera = nextStatusOnRoute((await ot()) as never, 'in_storage', tipos)!;
		expect(primera).toBeTruthy();

		// Sin decir de qué lote, no se mueve.
		const sinPapel = await mover(primera);
		expect(sinPapel.status).toBe(400);
		expect(sinPapel.json.code).toBe('PAPER_ISSUE_REQUIRED');
		expect((await ot()).status).toBe('in_storage');

		const conPapel = await mover(primera, { paper_issue: [{ lot_id: loteId, sheets: PLIEGOS }] });
		expect(conPapel.status, JSON.stringify(conPapel.json)).toBe(200);
		expect((await ot()).status).toBe(primera);

		const { data: lote } = await db.from('inventory_lots').select('quantity_available').eq('id', loteId).single();
		expect(Number((lote as J).quantity_available)).toBe(5_000 - PLIEGOS);

		const material = (await lineasReales()).filter((l) => l.category === 'material');
		expect(material).toHaveLength(1);
		expect(Number(material[0].total)).toBe(PLIEGOS * COSTO_PLIEGO);
	});

	it('5. el Tablero cierra la pasada con horas y la máquina cuesta recién ahí', async () => {
		const { nextStatusOnRoute } = await import('@/lib/production-route');
		const { data: maquinas } = await db.from('machines').select('id, type');
		const tipos = new Map(((maquinas ?? []) as J[]).map((m) => [m.id, m.type]));

		// Avanza por el Tablero hasta llegar a la impresión offset.
		let o = await ot();
		while (o.status !== 'offset_printing') {
			const sig = nextStatusOnRoute(o as never, o.status, tipos);
			expect(sig, `la ruta no pasa por offset desde ${o.status}`).toBeTruthy();
			const r = await mover(sig!, { stage_report: { hours: 1.5, merma_sheets: 0 } });
			expect(r.status, JSON.stringify(r.json)).toBe(200);
			o = await ot();
		}

		const { data: pasadas } = await db.from('ot_stage_reports').select('workflow_step, hours').eq('ot_id', otId);
		for (const p of (pasadas ?? []) as J[]) expect(Number(p.hours)).toBe(1.5);

		const maquina = (await lineasReales()).filter((l) => l.category === 'machine');
		expect(maquina.length).toBe((pasadas ?? []).length);
		for (const l of maquina) {
			expect(l.ref_type).toBe('stage_pass');
			expect(Number(l.total)).toBeGreaterThan(0);
		}
	});

	it('6. el parte de WhatsApp, revisado, cierra la impresión y mueve la OT por la misma puerta', async () => {
		const { processMessage } = await import('@/lib/whatsapp-ingest');
		const parte = await processMessage({
			from: '+56900000001',
			body: `fin ${otNumero} ${PLIEGOS} pliegos 20 merma`,
			timestamp: new Date().toISOString(),
			message_id: `${marca}-wamid`,
		} as never);
		expect(parte.status, JSON.stringify(parte.payload)).toBe(200);
		const logId = parte.payload.log_id as string;
		expect(logId).toBeTruthy();
		logs.push(logId);

		const maquinaAntes = (await lineasReales()).filter((l) => l.category === 'machine').length;

		const rev = await llamar(import('@/app/api/captures/review/route'), 'POST', '/api/captures/review', {
			source: 'whatsapp',
			ids: [logId],
			decision: 'approve',
			corrections: { data: { hours_reported: 2 } },
		});
		expect(rev.status, JSON.stringify(rev.json)).toBe(200);

		const o = await ot();
		expect(o.status).not.toBe('offset_printing');

		const { data: impresion } = await db
			.from('ot_stage_reports')
			.select('hours, merma_sheets')
			.eq('ot_id', otId)
			.eq('workflow_step', 'offset_printing');
		expect(impresion).toHaveLength(1);
		expect(Number((impresion as J[])[0].hours)).toBe(2);

		// Una pasada más, una línea de máquina más. El parte no escribe material.
		const despues = await lineasReales();
		expect(despues.filter((l) => l.category === 'machine').length).toBe(maquinaAntes + 1);
		expect(despues.filter((l) => l.category === 'material')).toHaveLength(1);
	});

	it('7. calidad, despacho, factura y cierre', async () => {
		const { nextStatusOnRoute } = await import('@/lib/production-route');
		const { data: maquinas } = await db.from('machines').select('id, type');
		const tipos = new Map(((maquinas ?? []) as J[]).map((m) => [m.id, m.type]));

		// Termina la ruta de producción por el Tablero.
		let o = await ot();
		for (;;) {
			const sig = nextStatusOnRoute(o as never, o.status, tipos);
			if (!sig || sig === 'in_delivery') break;
			const r = await mover(sig, { stage_report: { hours: 0.5, merma_sheets: 0 } });
			expect(r.status, JSON.stringify(r.json)).toBe(200);
			o = await ot();
		}

		// La firma del cliente por el portal NO es la revisión de calidad.
		const sinCalidad = await mover('ready_for_delivery');
		expect(sinCalidad.status).toBe(400);
		expect(sinCalidad.json.code).toBe('APPROVAL_REQUIRED');

		const calidad = await llamar(import('@/app/api/ots/[id]/approval/route'), 'POST', `/api/ots/${otId}/approval`, { action: 'approve' }, { id: otId });
		expect(calidad.status, JSON.stringify(calidad.json)).toBeLessThan(300);
		const lista = await mover('ready_for_delivery', { stage_report: { hours: 0.5, merma_sheets: 0 } });
		expect(lista.status, JSON.stringify(lista.json)).toBe(200);

		const guia = await llamar(import('@/app/api/dispatch-guides/route'), 'POST', '/api/dispatch-guides', {
			ot_id: otId,
			client_id: clienteId,
			client_name: `${marca} Cliente`,
			quantity: 10_000,
		});
		expect(guia.status, JSON.stringify(guia.json)).toBeLessThan(300);
		const guiaId = guia.json.id ?? guia.json.data?.id;
		expect(guiaId).toBeTruthy();
		guias.push(guiaId);

		const fac = await llamar(import('@/app/api/sales-invoices/route'), 'POST', '/api/sales-invoices', {
			ot_id: otId,
			client_id: clienteId,
			client_name: `${marca} Cliente`,
			guide_ids: [guiaId],
		});
		expect(fac.status, JSON.stringify(fac.json)).toBeLessThan(300);
		const facturaId = fac.json.id ?? fac.json.data?.id;
		expect(facturaId).toBeTruthy();
		facturas.push(facturaId);
		const { data: factura } = await db.from('sales_invoices').select('net_amount').eq('id', facturaId).single();
		// Una sola guía por el total: la factura es el precio de la OT, redondeado una vez.
		expect(Number((factura as J).net_amount)).toBe(PRECIO);

		o = await ot();
		if (o.status !== 'in_delivery') {
			const r = await mover('in_delivery');
			expect(r.status, JSON.stringify(r.json)).toBe(200);
		}
		const fin = await mover('completed');
		expect(fin.status, JSON.stringify(fin.json)).toBe(200);
		expect((await ot()).status).toBe('completed');
	});

	it('8. el libro queda coherente: un escritor por hecho', async () => {
		const reales = await lineasReales();
		// Material: una línea, lo que salió del lote a su costo. Nunca lo cotizado ($140).
		const material = reales.filter((l) => l.category === 'material');
		expect(material).toHaveLength(1);
		expect(Number(material[0].total)).toBe(PLIEGOS * COSTO_PLIEGO);
		// Máquina: exactamente una línea por cada pasada con horas en una etapa de
		// máquina (las de banco —revisión, embalaje— cuestan sólo mano de obra), y
		// cada línea apunta a su pasada. Ninguna pasada valorizada dos veces.
		const DE_MAQUINA = new Set(['guillotine_first_cut', 'offset_printing', 'die_cutting', 'guillotine_final_cut']);
		const { data: pasadas } = await db.from('ot_stage_reports').select('id, workflow_step, hours').eq('ot_id', otId);
		const valorizables = ((pasadas ?? []) as J[]).filter((p) => Number(p.hours) > 0 && DE_MAQUINA.has(p.workflow_step));
		const maquina = reales.filter((l) => l.category === 'machine');
		expect(maquina.every((l) => l.ref_type === 'stage_pass')).toBe(true);
		expect([...maquina.map((l) => l.ref_id)].sort(), JSON.stringify({ valorizables, maquina })).toEqual(
			valorizables.map((p) => p.id).sort(),
		);
		for (const l of maquina) {
			const pasada = valorizables.find((p) => p.id === l.ref_id)!;
			expect(Number(l.quantity)).toBe(Number(pasada.hours));
		}

		// Cada movimiento quedó una vez en la bitácora.
		const { data: h } = await db.from('ot_status_history').select('to_status').eq('ot_id', otId);
		const destinos = ((h ?? []) as J[]).map((r) => r.to_status);
		expect(new Set(destinos).size).toBe(destinos.length);
		expect(destinos).toContain('completed');

		// El papel salió una vez.
		const { data: salidas } = await db.from('inventory_stock_transactions').select('id').eq('lot_id', loteId);
		expect(salidas).toHaveLength(1);
	});
});
