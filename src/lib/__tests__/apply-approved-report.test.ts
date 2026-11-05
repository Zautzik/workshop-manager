import { describe, expect, it, vi, beforeEach } from 'vitest';

type Row = { ot_id: string; created_at: string; from_status: string | null; to_status: string };
let history: Row[] = [];

// Cadena mínima de PostgREST sobre `history`: eq / lte / gt / order / limit / maybeSingle.
function chain() {
	let rows = [...history];
	const c = {
		select: () => c,
		eq: (col: keyof Row, v: string) => { rows = rows.filter((r) => r[col] === v); return c; },
		lte: (_: 'created_at', v: string) => { rows = rows.filter((r) => r.created_at <= v); return c; },
		gt: (_: 'created_at', v: string) => { rows = rows.filter((r) => r.created_at > v); return c; },
		order: (_: 'created_at', o: { ascending: boolean }) => {
			rows.sort((a, b) => (o.ascending ? 1 : -1) * a.created_at.localeCompare(b.created_at));
			return c;
		},
		limit: () => c,
		maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
	};
	return c;
}

vi.mock('@/integrations/supabase/server', () => ({
	supabaseAdmin: { from: vi.fn(() => chain()) },
}));

import { statusAt } from '../apply-approved-report';
import { resolveFlow } from '../whatsapp-flow';

const OT = 'ot-41221';

describe('statusAt — el parte se resuelve contra la etapa del mensaje', () => {
	beforeEach(() => {
		history = [
			{ ot_id: OT, created_at: '2026-10-20T10:00:00Z', from_status: 'pre_press', to_status: 'offset_printing' },
			{ ot_id: OT, created_at: '2026-10-28T17:14:00Z', from_status: 'offset_printing', to_status: 'guillotine_first_cut' },
		];
	});

	it('un «fin» del 27 habla de la prensa aunque la OT ya esté en la guillotina', async () => {
		expect(await statusAt(OT, '2026-10-27T23:45:11Z', 'guillotine_first_cut')).toBe('offset_printing');
	});

	it('un mensaje posterior al último movimiento usa la etapa actual', async () => {
		expect(await statusAt(OT, '2026-11-01T09:00:00Z', 'guillotine_first_cut')).toBe('guillotine_first_cut');
	});

	it('un mensaje anterior a todo el historial usa el from_status del primer movimiento', async () => {
		expect(await statusAt(OT, '2026-10-01T09:00:00Z', 'guillotine_first_cut')).toBe('pre_press');
	});

	it('sin fecha o sin historial, el estado actual (comportamiento previo)', async () => {
		expect(await statusAt(OT, null, 'guillotine_first_cut')).toBe('guillotine_first_cut');
		history = [];
		expect(await statusAt(OT, '2026-10-27T23:45:11Z', 'die_cutting')).toBe('die_cutting');
	});

	it('resuelto contra la prensa, el «fin» cierra la prensa — no la guillotina', async () => {
		const at = await statusAt(OT, '2026-10-27T23:45:11Z', 'guillotine_first_cut');
		const p = resolveFlow(at, { message_type: 'end', hours_reported: 6, confidence: 100 });
		expect(p.closeStage).toBe('offset_printing');
	});
});
