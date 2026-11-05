import { describe, expect, it, vi, beforeEach } from 'vitest';

/*
 * Base en memoria con lo justo de PostgREST, el disparador espejo
 * (log legado → capture_events) y una imitación de `apply_capture_event`
 * (20261105120000): mira los dos guardias, marca el log y la captura.
 */
type Row = Record<string, any>;
let db: Record<string, Row[]>;
const rpc = vi.fn();
const flow = vi.fn();
let applyFails = false;

function mirror(table: string, row: Row) {
	const cap = db.capture_events.find((c) => c.legacy_table === table && c.legacy_id === row.id);
	if (!cap) return;
	cap.status = row.review_status;
	if (table === 'whatsapp_production_logs') {
		cap.applied = row.fed_to_system;
		cap.corrected_data = row.corrected_data ?? null;
		cap.corrected_costs = row.corrected_costs ?? null;
	} else {
		cap.applied = row.fed_to_inventory;
		cap.quantity = row.corrected_quantity ?? row.quantity;
	}
}

function applyCaptureEvent(id: string): { message: string } | null {
	if (applyFails) return { message: 'boom' };
	const c = db.capture_events.find((r) => r.id === id)!;
	const legacy = c.legacy_table ? db[c.legacy_table].find((r) => r.id === c.legacy_id) : null;
	const legacyFed = legacy && (legacy.fed_to_system || legacy.fed_to_inventory);
	if (!['approved', 'auto_approved'].includes(c.status)) return { message: 'La captura debe estar aprobada' };
	if (c.applied || legacyFed) return { message: 'La captura ya fue aplicada' };
	if (legacy && c.legacy_table === 'whatsapp_production_logs') { legacy.fed_to_system = true; mirror(c.legacy_table, legacy); }
	if (legacy && c.legacy_table === 'whatsapp_warehouse_logs') { legacy.fed_to_inventory = true; mirror(c.legacy_table, legacy); }
	c.applied = true;
	return null;
}

function from(table: string) {
	const filters: [string, unknown][] = [];
	let patch: Row | null = null;
	const run = () => {
		const rows = db[table].filter((r) => filters.every(([k, v]) => r[k] === v));
		if (patch) for (const r of rows) {
			Object.assign(r, patch);
			if (table !== 'capture_events') mirror(table, r);
		}
		return rows;
	};
	const c: any = {
		select: () => c,
		update: (p: Row) => { patch = p; return c; },
		eq: (k: string, v: unknown) => { filters.push([k, v]); return c; },
		maybeSingle: () => { const r = run()[0]; return Promise.resolve({ data: r ? { ...r } : null, error: null }); },
		single: () => { const r = run()[0]; return Promise.resolve(r ? { data: { ...r }, error: null } : { data: null, error: { message: 'no row' } }); },
	};
	return c;
}

vi.mock('@/integrations/supabase/server', () => ({
	supabaseAdmin: {
		from: (t: string) => from(t),
		rpc: (name: string, args: Row) => {
			rpc(name, args);
			const error = name === 'apply_capture_event' ? applyCaptureEvent(args.p_event_id) : null;
			return Promise.resolve({ data: null, error });
		},
	},
}));
vi.mock('@/lib/apply-approved-report', () => ({
	applyApprovedProductionReport: (...a: unknown[]) => { flow(...a); return Promise.resolve({ flow: null, warning: null }); },
}));

import { CorrectionsSchema, reviewCapture } from '../golden-thread';

const actor = { id: 'sup-1', role: 'supervisor' as const };

beforeEach(() => {
	rpc.mockClear();
	flow.mockClear();
	applyFails = false;
	db = {
		whatsapp_production_logs: [{
			id: 'log-1', ot_id: 'ot-1', review_status: 'pending', fed_to_system: false, message_type: 'end',
			parsed_data: { hours_reported: 6, unparsed_notes: '500 pliegos 6 horas' },
			inferred_costs: { paper_cost: 1, cost_lines: [] }, message_timestamp: '2026-10-27T23:45:11Z',
		}],
		whatsapp_warehouse_logs: [{ id: 'wh-1', item_id: 'item-1', quantity: 10, review_status: 'pending', fed_to_inventory: false }],
		capture_events: [
			{ id: 'cap-1', domain: 'production', legacy_table: 'whatsapp_production_logs', legacy_id: 'log-1', status: 'pending', applied: false, ot_id: 'ot-1' },
			{ id: 'cap-wh', domain: 'warehouse', channel: 'whatsapp', legacy_table: 'whatsapp_warehouse_logs', legacy_id: 'wh-1', status: 'pending', applied: false },
			{ id: 'cap-qr', domain: 'warehouse', channel: 'qr', lot_id: 'lot-1', legacy_table: null, status: 'pending', applied: false },
		],
	};
});

const writers = () => rpc.mock.calls.map((c) => c[0]);

describe('hilo dorado — un solo escritor para todas las puertas', () => {
	it.each([
		['capture', 'cap-1'],
		['whatsapp', 'log-1'],
	] as const)('aprobar un mensaje desde %s llama sólo a apply_capture_event, con la captura y el supervisor', async (source, id) => {
		const r = await reviewCapture(source, id, { decision: 'approve' }, actor);
		expect(r).toMatchObject({ ok: true, captureId: 'cap-1', applied: 'now' });
		expect(rpc.mock.calls).toEqual([['apply_capture_event', { p_event_id: 'cap-1', p_actor: 'sup-1' }]]);
		expect(db.whatsapp_production_logs[0]).toMatchObject({ review_status: 'approved', fed_to_system: true });
		expect(db.capture_events[0]).toMatchObject({ status: 'approved', applied: true });
		expect(flow).toHaveBeenCalledTimes(1);
	});

	it('bodega y foto de lote: el mismo escritor', async () => {
		await reviewCapture('warehouse', 'wh-1', { decision: 'approve', corrections: { quantity: 7 } }, actor);
		await reviewCapture('capture', 'cap-qr', { decision: 'approve' }, actor);
		expect(writers()).toEqual(['apply_capture_event', 'apply_capture_event']);
		expect(db.whatsapp_warehouse_logs[0].corrected_quantity).toBe(7);
		expect(db.capture_events[1]).toMatchObject({ applied: true, quantity: 7 });
		expect(flow).not.toHaveBeenCalled();
	});

	it('aprobar dos veces —desde cualquier pantalla— aplica una sola vez', async () => {
		await reviewCapture('whatsapp', 'log-1', { decision: 'approve' }, actor);
		const r = await reviewCapture('capture', 'cap-1', { decision: 'approve' }, actor);
		expect(writers()).toEqual(['apply_capture_event']);
		expect(flow).toHaveBeenCalledTimes(1);
		expect(r).toMatchObject({ ok: true, applied: 'before' });
	});

	it('un parte que la otra puerta ya aplicó se reconoce por cualquiera de los dos guardias', async () => {
		db.capture_events[0].applied = true;
		const r = await reviewCapture('whatsapp', 'log-1', { decision: 'approve' }, actor);
		expect(rpc).not.toHaveBeenCalled();
		expect(r).toMatchObject({ ok: true, applied: 'before' });
	});

	it('rechazar algo ya integrado se niega; rechazar a tiempo no aplica nada', async () => {
		expect((await reviewCapture('whatsapp', 'log-1', { decision: 'reject' }, actor)).ok).toBe(true);
		expect(rpc).not.toHaveBeenCalled();
		expect(db.capture_events[0].status).toBe('rejected');

		await reviewCapture('whatsapp', 'log-1', { decision: 'approve' }, actor);
		expect(await reviewCapture('capture', 'cap-1', { decision: 'reject' }, actor)).toMatchObject({ ok: false, status: 409 });
	});

	it('si el escritor falla, la OT no se toca y volver a aprobar reintenta todo junto', async () => {
		applyFails = true;
		const r = await reviewCapture('whatsapp', 'log-1', { decision: 'approve' }, actor);
		expect(r).toMatchObject({ ok: true, applied: 'no' });
		expect(flow).not.toHaveBeenCalled();
		applyFails = false;
		expect(await reviewCapture('whatsapp', 'log-1', { decision: 'approve' }, actor)).toMatchObject({ applied: 'now' });
		expect(flow).toHaveBeenCalledTimes(1);
	});
});

describe('hilo dorado — correcciones (H3′)', () => {
	it('el servidor fusiona los datos con el parse y recalcula los totales', async () => {
		await reviewCapture('capture', 'cap-1', {
			decision: 'approve',
			corrections: {
				data: { hours_reported: 8 },
				costLines: [{ category: 'papel', description: 'Papel', quantity: 10, unit: 'kg', unit_cost: 1500, source: 'parsed' }],
			},
		}, actor);
		const log = db.whatsapp_production_logs[0];
		expect(log.corrected_data).toEqual({ hours_reported: 8, unparsed_notes: '500 pliegos 6 horas' });
		expect(log.corrected_costs).toMatchObject({ paper_cost: 1, total_inferred_cost: 15000 });
		expect(log.corrected_costs.cost_lines[0].total_cost).toBe(15000);
		expect(flow.mock.calls[0][0]).toMatchObject({ parsed: { hours_reported: 8 }, eventType: 'end' });
	});

	it.each([
		['un total escrito a mano', { costLines: [{ category: 'papel', description: 'x', quantity: 1, unit: 'kg', unit_cost: 1, total_cost: 9e9 }] }],
		['una categoría inventada', { costLines: [{ category: 'propina', description: 'x', quantity: 1, unit: 'un', unit_cost: 1 }] }],
		['un costo negativo', { costLines: [{ category: 'otros', description: 'x', quantity: 1, unit: 'un', unit_cost: -5 }] }],
		['un campo de datos que no es editable', { data: { confidence: 100 } }],
		['más de 24 horas', { data: { hours_reported: 30 } }],
		['un proceso desconocido', { data: { processes_mentioned: ['magia'] } }],
	])('rechaza %s', (_label, body) => {
		expect(CorrectionsSchema.safeParse(body).success).toBe(false);
	});
});
