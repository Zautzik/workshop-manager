import { describe, it, expect } from 'vitest';
import {
	OTStatusSchema,
	isValidStatus,
	getAllowedNextStatuses,
	validateTransition,
} from '@/lib/ot-state-machine';

describe('OTStatusSchema', () => {
	it('contains the expected number of statuses', () => {
		expect(OTStatusSchema.options.length).toBeGreaterThanOrEqual(15);
	});

	it('includes digital_printing (previously absent in the drifted copy)', () => {
		expect(OTStatusSchema.options).toContain('digital_printing');
	});

	it('includes all core workflow milestones', () => {
		const required = ['pre_press', 'workshop', 'ready_for_delivery', 'in_delivery', 'completed'];
		for (const s of required) {
			expect(OTStatusSchema.options).toContain(s);
		}
	});
});

describe('isValidStatus', () => {
	it('returns true for every member of OTStatusSchema', () => {
		for (const s of OTStatusSchema.options) {
			expect(isValidStatus(s), `expected ${s} to be valid`).toBe(true);
		}
	});

	it('returns false for unknown strings', () => {
		expect(isValidStatus('done')).toBe(false);
		expect(isValidStatus('')).toBe(false);
		expect(isValidStatus('COMPLETED')).toBe(false);
		expect(isValidStatus('in_progress')).toBe(false);
	});
});

describe('getAllowedNextStatuses', () => {
	it('pre_press can advance to every subsequent status', () => {
		const next = getAllowedNextStatuses('pre_press');
		expect(next.length).toBe(OTStatusSchema.options.length - 1);
	});

	it('completed has no forward transitions', () => {
		expect(getAllowedNextStatuses('completed')).toHaveLength(0);
	});

	it('never includes the current status itself', () => {
		for (const s of OTStatusSchema.options) {
			expect(getAllowedNextStatuses(s)).not.toContain(s);
		}
	});

	it('each step can reach the next step', () => {
		const statuses = OTStatusSchema.options;
		for (let i = 0; i < statuses.length - 1; i++) {
			const allowed = getAllowedNextStatuses(statuses[i]);
			expect(allowed).toContain(statuses[i + 1]);
		}
	});
});

describe('validateTransition', () => {
	it('allows a valid forward transition for admin', () => {
		const result = validateTransition({
			fromStatus: 'pre_press',
			toStatus: 'visto_bueno',
			role: 'admin',
			hasApprovedApproval: false,
			hasAnyRealCosts: false,
		});
		expect(result.ok).toBe(true);
	});

	it('requires approval before ready_for_delivery', () => {
		const result = validateTransition({
			fromStatus: 'workshop',
			toStatus: 'ready_for_delivery',
			role: 'admin',
			hasApprovedApproval: false,
			hasAnyRealCosts: true,
		});
		expect(result.ok).toBe(false);
		expect(result.code).toBe('APPROVAL_REQUIRED');
	});

	it('requires real costs before completed', () => {
		const result = validateTransition({
			fromStatus: 'in_delivery',
			toStatus: 'completed',
			role: 'admin',
			hasApprovedApproval: true,
			hasAnyRealCosts: false,
		});
		expect(result.ok).toBe(false);
		expect(result.code).toBe('COSTS_REQUIRED');
	});

	it('requires real costs before in_delivery', () => {
		const result = validateTransition({
			fromStatus: 'ready_for_delivery',
			toStatus: 'in_delivery',
			role: 'admin',
			hasApprovedApproval: true,
			hasAnyRealCosts: false,
		});
		expect(result.ok).toBe(false);
		expect(result.code).toBe('COSTS_REQUIRED');
	});

	it('blocks a technician from accessing delivery statuses', () => {
		const result = validateTransition({
			fromStatus: 'workshop',
			toStatus: 'ready_for_delivery',
			role: 'technician',
			hasApprovedApproval: true,
			hasAnyRealCosts: true,
		});
		expect(result.ok).toBe(false);
		expect(result.code).toBe('ROLE_FORBIDDEN');
	});

	it('allows admin rollback to a previous status', () => {
		const result = validateTransition({
			fromStatus: 'workshop',
			toStatus: 'offset_printing',
			role: 'admin',
			hasApprovedApproval: false,
			hasAnyRealCosts: false,
			rollback: true,
		});
		expect(result.ok).toBe(true);
	});

	it('blocks non-admin/supervisor rollback', () => {
		const result = validateTransition({
			fromStatus: 'workshop',
			toStatus: 'offset_printing',
			role: 'manager',
			hasApprovedApproval: false,
			hasAnyRealCosts: false,
			rollback: true,
		});
		expect(result.ok).toBe(false);
		expect(result.code).toBe('ROLE_FORBIDDEN');
	});

	it('allows supervisor rollback', () => {
		const result = validateTransition({
			fromStatus: 'workshop',
			toStatus: 'guillotine_first_cut',
			role: 'supervisor',
			hasApprovedApproval: false,
			hasAnyRealCosts: false,
			rollback: true,
		});
		expect(result.ok).toBe(true);
	});
});
