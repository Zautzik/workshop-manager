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

/* ─── Las compuertas de completitud ──────────────────────────── */

describe('no se sale de Pre-Prensa con la ficha a medias', () => {
	const COTIZABLE = {
		clientId: 'c1', productType: 'caja_plegadiza', quantity: 200_000,
		widthCm: 20, heightCm: 30, substrateType: 'cartulina', grammageGsm: 300,
		colorFront: 'cmyk', deadline: '2026-09-15', pressId: 'r1',
	};
	const PRODUCIBLE = {
		...COTIZABLE, substrateBrand: 'Ártica', substrateSupplier: 'Bío Bío',
		impositionConfirmed: true, machineId: 'r1', artAttached: true, operationsReviewed: true,
	};
	const base = {
		fromStatus: 'pre_press' as const, toStatus: 'visto_bueno' as const,
		role: 'admin' as const, hasApprovedApproval: false, hasAnyRealCosts: false,
	};

	it('una OT cotizable pero no producible no llega a la prueba', () => {
		// Firmar una prueba es el punto de no retorno: después se compra papel y
		// se graban planchas. Pedirle al cliente que apruebe una orden que no sabe
		// qué papel lleva es pedirle que apruebe algo que no existe.
		const v = validateTransition({ ...base, spec: COTIZABLE });
		expect(v.ok).toBe(false);
		expect(v.code).toBe('SPEC_INCOMPLETE');
	});

	it('el mensaje NOMBRA lo que falta', () => {
		// «Ficha incompleta» obliga a adivinar. Esto se puede accionar.
		const v = validateTransition({ ...base, spec: COTIZABLE });
		expect(v.message).toContain('montaje confirmado');
		expect(v.gaps!.length).toBeGreaterThan(0);
	});

	it('NO pide la marca del papel: eso se decide al comprarlo', () => {
		// Depende de qué hay en plaza esa semana y a qué precio. Pedirla en
		// Pre-Prensa frenaba la prueba por un dato que nadie tenía todavía; el
		// motor cotiza con el promedio de lo que el taller viene pagando.
		const v = validateTransition({ ...base, spec: COTIZABLE });
		expect(v.message).not.toContain('sustrato');
		expect(v.gaps!.map((g) => g.field)).not.toContain('substrateBrand');
	});

	it('con la ficha completa pasa', () => {
		expect(validateTransition({ ...base, spec: PRODUCIBLE }).ok).toBe(true);
	});

	it('sin ficha se comporta como antes: la compuerta no rompe a nadie', () => {
		// Una compuerta que rompe todos los llamadores existentes no se despliega.
		expect(validateTransition(base).ok).toBe(true);
	});

	it('sólo vigila el paso a la prueba, no cualquier avance', () => {
		const v = validateTransition({
			...base, fromStatus: 'offset_printing', toStatus: 'die_cutting', spec: COTIZABLE,
		});
		expect(v.ok).toBe(true);
	});
});

describe('el precio firme no se aleja en silencio', () => {
	const base = {
		fromStatus: 'visto_bueno' as const, toStatus: 'paper_purchase' as const,
		role: 'admin' as const, hasApprovedApproval: false, hasAnyRealCosts: false,
	};

	it('46% arriba frena la compra de papel', () => {
		// Comprar papel y grabar planchas es donde el trabajo queda comprometido.
		const v = validateTransition({ ...base, quotedPrice: 976_811, firmPrice: 1_426_613 });
		expect(v.ok).toBe(false);
		expect(v.code).toBe('REPRICE_REQUIRED');
		expect(v.message).toContain('reconfirmar');
	});

	it('con el cliente reconfirmado sigue', () => {
		// No se bloquea para siempre: se pide que alguien se haga cargo.
		const v = validateTransition({
			...base, quotedPrice: 976_811, firmPrice: 1_426_613, repriceApproved: true,
		});
		expect(v.ok).toBe(true);
	});

	it('una diferencia chica no molesta a nadie', () => {
		expect(validateTransition({ ...base, quotedPrice: 1_000_000, firmPrice: 1_050_000 }).ok).toBe(true);
	});

	it('si salió MÁS BARATO no hay nada que reconfirmar', () => {
		expect(validateTransition({ ...base, quotedPrice: 1_000_000, firmPrice: 700_000 }).ok).toBe(true);
	});

	it('sin los dos precios no inventa una compuerta', () => {
		expect(validateTransition({ ...base, quotedPrice: null, firmPrice: 1_426_613 }).ok).toBe(true);
	});
});
