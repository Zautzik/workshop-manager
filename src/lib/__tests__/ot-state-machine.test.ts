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

	it('without roleAccess, falls back to the hardcoded default (unchanged pre-table behavior)', () => {
		const result = validateTransition({
			fromStatus: 'guillotine_final_cut',
			toStatus: 'workshop',
			role: 'technician',
			hasApprovedApproval: true,
			hasAnyRealCosts: true,
		});
		expect(result.ok).toBe(true);
	});

	it('an explicit roleAccess override wins over the hardcoded default', () => {
		// Un técnico habilitado por tabla para cerrar directo a `completed`,
		// algo que el default hardcodeado nunca permite.
		const result = validateTransition({
			fromStatus: 'in_delivery',
			toStatus: 'completed',
			role: 'technician',
			hasApprovedApproval: true,
			hasAnyRealCosts: true,
			roleAccess: { technician: ['completed'] } as any,
		});
		expect(result.ok).toBe(true);
	});

	it('an explicit roleAccess override can also be stricter than the default', () => {
		// admin normalmente puede todo; una tabla que sólo lo lista para
		// `pre_press` lo restringe igual que a cualquier otro rol.
		const result = validateTransition({
			fromStatus: 'workshop',
			toStatus: 'ready_for_delivery',
			role: 'admin',
			hasApprovedApproval: true,
			hasAnyRealCosts: true,
			roleAccess: { admin: ['pre_press'] } as any,
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
		// Explícitos en `false`, como los arma la ruta de transición real (`count
		// > 0`) -- no `undefined`. La compuerta bloqueaba `undefined` bien y
		// dejaba pasar `false`: un fixture que sólo omite el campo no habría
		// atrapado ese bug nunca.
		impositionConfirmed: false, operationsReviewed: false,
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

	it('montaje no confirmado Y operaciones no revisadas SÍ son gaps, aunque valgan false', () => {
		// Regresión: `missingFor` delegaba estos dos campos a `vacio()`, que sólo
		// reconoce como "falta" null/undefined/string vacío/número<=0/array vacío.
		// `vacio(false)` da `false` -- no falta -- así que un booleano real en
		// `false` nunca se reportaba como gap, para ninguna OT (auditoría
		// 2026-08-30). `COTIZABLE` ya trae ambos en `false`, como los arma la
		// ruta real; esto lo hace explícito para que no se pueda romper en
		// silencio otra vez.
		const v = validateTransition({ ...base, spec: COTIZABLE });
		expect(v.gaps!.map((g) => g.field)).toEqual(
			expect.arrayContaining(['impositionConfirmed', 'operationsReviewed']),
		);
	});

	it('una PRODUCIBLE con el montaje marcado false explícito vuelve a fallar', () => {
		const v = validateTransition({
			...base, spec: { ...PRODUCIBLE, impositionConfirmed: false },
		});
		expect(v.ok).toBe(false);
		expect(v.gaps!.map((g) => g.field)).toContain('impositionConfirmed');
	});

	it('un salto largo desde pre_press tampoco esquiva la compuerta', () => {
		// Regresión: la compuerta sólo miraba el hop exacto pre_press ->
		// visto_bueno. El forward-only permite pedir cualquier estado posterior
		// en una sola llamada -- una OT nacida por conversión de cotización puede
		// pedir `in_storage` directamente, saltándose visto_bueno entero -- y ese
		// salto la esquivaba aunque la ficha fuera sólo nivel 1 (auditoría
		// 2026-08-30).
		const v = validateTransition({ ...base, toStatus: 'in_storage', spec: COTIZABLE });
		expect(v.ok).toBe(false);
		expect(v.code).toBe('SPEC_INCOMPLETE');
	});

	it('el mismo salto largo pasa con la ficha completa', () => {
		expect(validateTransition({ ...base, toStatus: 'in_storage', spec: PRODUCIBLE }).ok).toBe(true);
	});

	it('no vigila salidas de otro estado que no sea pre_press', () => {
		const v = validateTransition({
			...base, fromStatus: 'offset_printing', toStatus: 'die_cutting', spec: COTIZABLE,
			// La pasada por la prensa se declara para que lo que se mida acá sea la
			// ficha y no el cierre de etapa, que tiene su propia prueba.
			stageReport: { hours: 4 },
		});
		expect(v.ok).toBe(true);
	});
});

describe('no se compra papel sin visto bueno de verdad', () => {
	const base = {
		fromStatus: 'visto_bueno' as const, toStatus: 'paper_purchase' as const,
		role: 'admin' as const, hasApprovedApproval: false, hasAnyRealCosts: false,
	};

	it('sin ot_approvals aprobado, no se compra papel', () => {
		// Regresión: la documentación (2026-08-15) daba esto por conectado y
		// nadie lo había escrito -- `hasApprovedApproval` sólo se exigía para
		// ready_for_delivery. Confirmado en vivo (auditoría 2026-08-30).
		const v = validateTransition(base);
		expect(v.ok).toBe(false);
		expect(v.code).toBe('APPROVAL_REQUIRED');
	});

	it('con la aprobación cargada, pasa', () => {
		expect(validateTransition({ ...base, hasApprovedApproval: true }).ok).toBe(true);
	});

	it('un rollback de vuelta a paper_purchase no exige aprobación de nuevo', () => {
		// Reponer papel tras una merma no es pedirle al cliente que apruebe otra
		// vez un trabajo que ya aprobó una vez.
		const v = validateTransition({
			fromStatus: 'offset_printing', toStatus: 'paper_purchase', role: 'admin',
			hasApprovedApproval: false, hasAnyRealCosts: false, rollback: true,
		});
		expect(v.ok).toBe(true);
	});
});

describe('el precio firme no se aleja en silencio', () => {
	const base = {
		fromStatus: 'visto_bueno' as const, toStatus: 'paper_purchase' as const,
		// La aprobación va aparte (ver arriba); acá se aísla el drift de precio.
		role: 'admin' as const, hasApprovedApproval: true, hasAnyRealCosts: false,
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

describe('la compuerta de Compras', () => {
	const base = {
		fromStatus: 'paper_purchase' as const,
		toStatus: 'in_storage' as const,
		role: 'admin' as const,
		hasApprovedApproval: true,
		hasAnyRealCosts: true,
	};

	it('no se entra a producción con requisitos pendientes', () => {
		const r = validateTransition({
			...base,
			requirements: [
				{ description: 'Pantone 485 C', status: 'pendiente' },
				{ description: 'Cajas para despacho', status: 'resuelto' },
			],
		});
		expect(r.ok).toBe(false);
		expect(r.code).toBe('REQUISITOS_PENDIENTES');
		expect(r.message).toContain('Pantone 485 C');
	});

	it('todo resuelto deja pasar', () => {
		const r = validateTransition({
			...base,
			requirements: [{ description: 'Papel', status: 'resuelto' }],
		});
		expect(r.ok).toBe(true);
	});

	it('«no aplica» no frena', () => {
		const r = validateTransition({
			...base,
			requirements: [
				{ description: 'Papel', status: 'resuelto' },
				{ description: 'Polilaminado', status: 'no_aplica' },
			],
		});
		expect(r.ok).toBe(true);
	});

	// Frenar por «no se sabe» enseñaría a cargar una lista vacía para poder
	// avanzar, que es peor que no tener la compuerta.
	it('sin requisitos cargados no bloquea', () => {
		expect(validateTransition(base).ok).toBe(true);
		expect(validateTransition({ ...base, requirements: [] }).ok).toBe(true);
	});
});

describe('mover es libre; el cierre se pide, no se exige', () => {
	const base = {
		fromStatus: 'die_cutting' as const,
		toStatus: 'guillotine_final_cut' as const,
		role: 'supervisor' as const,
		hasApprovedApproval: false,
		hasAnyRealCosts: false,
	};

	// Frenar la tarjeta no hace que alguien cargue las horas: hace que el trabajo
	// se mueva por fuera del sistema, que es la única forma de perderlo del todo.
	it('sin cierre la OT sale igual del troquel', () => {
		expect(validateTransition(base).ok).toBe(true);
	});

	it('sin horas pero con lo demás, también', () => {
		const r = validateTransition({
			...base, stageReport: { hours: null, mermaSheets: 120, issues: 'Se trabó dos veces.' },
		});
		expect(r.ok).toBe(true);
	});

	it('con las horas declaradas pasa', () => {
		expect(validateTransition({ ...base, stageReport: { hours: 5.5 } }).ok).toBe(true);
	});

	// Lo que falta se puede completar; lo que está mal hay que descubrirlo.
	it('un dato imposible sí frena, con el motivo', () => {
		const r = validateTransition({ ...base, stageReport: { hours: 480 } });
		expect(r.ok).toBe(false);
		expect(r.code).toBe('STAGE_REPORT_INVALID');
		expect(r.message).toContain('dividí por 60');
	});

	it('en una etapa que no se cierra, un cierre inválido no se juzga', () => {
		const r = validateTransition({
			...base, fromStatus: 'outsourced', toStatus: 'workshop_revision',
			stageReport: { hours: 480 },
		});
		expect(r.ok).toBe(true);
	});
});

describe('no se despacha con pasadas sin cerrar', () => {
	const base = {
		fromStatus: 'workshop_revision' as const,
		toStatus: 'ready_for_delivery' as const,
		role: 'supervisor' as const,
		hasApprovedApproval: true,
		hasAnyRealCosts: true,
	};

	it('frena y nombra la etapa que falta', () => {
		const r = validateTransition({
			...base, openPasses: [{ workflow_step: 'die_cutting' }],
		});
		expect(r.ok).toBe(false);
		expect(r.code).toBe('PASADAS_ABIERTAS');
		expect(r.message).toContain('Troquelado');
	});

	it('sin pasadas abiertas deja pasar', () => {
		expect(validateTransition({ ...base, openPasses: [] }).ok).toBe(true);
	});

	// Frenar por «no se sabe» es la falla que las compuertas 1 y 3 ya evitan.
	it('si no se consultó, la compuerta no corre', () => {
		expect(validateTransition(base).ok).toBe(true);
	});

	it('cobra en las tres etapas de salida', () => {
		for (const to of ['ready_for_delivery', 'in_delivery', 'completed'] as const) {
			const r = validateTransition({
				...base, fromStatus: 'workshop_revision', toStatus: to,
				openPasses: [{ workflow_step: 'offset_printing' }],
			});
			expect(r.code, `esperaba compuerta al pasar a ${to}`).toBe('PASADAS_ABIERTAS');
		}
	});

	it('no molesta mientras la OT sigue en el taller', () => {
		const r = validateTransition({
			...base, fromStatus: 'die_cutting', toStatus: 'guillotine_final_cut',
			openPasses: [{ workflow_step: 'offset_printing' }],
		});
		expect(r.ok).toBe(true);
	});

	// Retroceder es corregir un error de tablero, no terminar un trabajo.
	it('un retroceso nunca cobra nada', () => {
		const r = validateTransition({
			...base, fromStatus: 'die_cutting', toStatus: 'offset_printing',
			rollback: true, role: 'admin', openPasses: [{ workflow_step: 'offset_printing' }],
		});
		expect(r.ok).toBe(true);
	});
});
