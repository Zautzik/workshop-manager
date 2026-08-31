import { describe, expect, it, vi, beforeEach } from 'vitest';

const insertMock = vi.fn();
const selectChain = {
	select: vi.fn(() => selectChain),
	in: vi.fn(() => selectChain),
	neq: vi.fn(() => selectChain),
	limit: vi.fn(() => Promise.resolve({ data: [{ user_id: 'u1', role: 'admin' }], error: null })),
};

vi.mock('@/integrations/supabase/server', () => ({
	supabaseAdmin: {
		from: vi.fn((table: string) => {
			if (table === 'notifications') return { insert: insertMock };
			if (table === 'user_roles') return selectChain;
			return { insert: vi.fn(() => Promise.resolve({ data: null, error: null })) };
		}),
	},
}));

import { dispatchNotifications, type EmittedDomainEvent } from '../domain-events';

describe('dispatchNotifications', () => {
	beforeEach(() => {
		insertMock.mockReset();
		insertMock.mockResolvedValue({ data: null, error: null });
	});

	const baseEvent: EmittedDomainEvent = {
		id: 'evt-1',
		type: 'ot.status_changed',
		otId: 'ot-1',
		actorId: 'actor-1',
		actorRole: 'technician',
		payload: { ot_number: '41500', to_status: 'workshop', actor_name: 'Juan' },
	};

	it('does not notify for a non-milestone status', async () => {
		await dispatchNotifications(baseEvent);
		expect(insertMock).not.toHaveBeenCalled();
	});

	it('notifies for ready_for_delivery', async () => {
		await dispatchNotifications({
			...baseEvent,
			payload: { ...baseEvent.payload, to_status: 'ready_for_delivery' },
		});
		expect(insertMock).toHaveBeenCalledTimes(1);
		const rows = insertMock.mock.calls[0][0];
		expect(rows[0].title).toContain('41500');
		expect(rows[0].title).toContain('lista para despacho');
	});

	it('notifies for completed', async () => {
		await dispatchNotifications({
			...baseEvent,
			payload: { ...baseEvent.payload, to_status: 'completed' },
		});
		expect(insertMock).toHaveBeenCalledTimes(1);
		const rows = insertMock.mock.calls[0][0];
		expect(rows[0].title).toContain('completada');
		expect(rows[0].message).toContain('Juan');
	});
});
