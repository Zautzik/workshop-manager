import { describe, expect, it } from 'vitest';

import { PORTAL_ACTOR } from '../ot-approval-origin';
import { buildOTSpec } from '../ot-spec';
import {
	approvalOpensGate,
	inheritSpecColumns,
	lineageIds,
	splitOwner,
	type LineageApproval,
} from '../ot-split-lineage';
import { validateTransition, type OTWorkflowStatus } from '../ot-state-machine';

const padre = { id: 'ot-a', ot_number: '40879' };
const fragB = { id: 'ot-b', ot_number: '40879-B' };
const fragC = { id: 'ot-c', ot_number: '40879-C' };
const grupo = [padre, fragB, fragC];

describe('quién es la dueña de un grupo partido', () => {
	it('la que conserva el número sin sufijo, para cualquier fragmento', () => {
		expect(splitOwner(fragB, grupo)).toBe(padre);
		expect(splitOwner(fragC, grupo)).toBe(padre);
		expect(splitOwner(padre, grupo)).toBe(padre);
	});

	it('si la dueña no está en el grupo, la OT responde por sí misma', () => {
		expect(splitOwner(fragB, [fragB, fragC])).toBe(fragB);
		expect(splitOwner(fragB, [])).toBe(fragB);
	});

	it('el linaje es la OT y su dueña, sin repetir', () => {
		expect(lineageIds(fragB, padre)).toEqual(['ot-b', 'ot-a']);
		expect(lineageIds(padre, padre)).toEqual(['ot-a']);
	});
});

describe('la ficha que split_ot no copia', () => {
	const fichaPadre = {
		...padre, sin_arte: true, ink_coverage: 'alta', die_source: 'existente', die_code: 'T-114',
		die_id: null, cliche_code: 'CL-9', relieve_matrix_code: null, lamination_type: 'mate',
	};
	const fichaFragmento = {
		...fragB, sin_arte: false, ink_coverage: null, die_source: null, die_code: null,
		die_id: null, cliche_code: '', relieve_matrix_code: null, lamination_type: null,
	};

	it('el fragmento completa sus huecos desde la dueña', () => {
		const r = inheritSpecColumns(fichaFragmento, fichaPadre);
		expect(r).toMatchObject({
			id: 'ot-b', sin_arte: true, ink_coverage: 'alta', die_source: 'existente',
			die_code: 'T-114', cliche_code: 'CL-9', lamination_type: 'mate',
		});
	});

	it('lo que el fragmento tiene escrito manda', () => {
		const r = inheritSpecColumns({ ...fichaFragmento, lamination_type: 'brillante' }, fichaPadre);
		expect(r.lamination_type).toBe('brillante');
	});

	it('la dueña no se hereda a sí misma, y sin dueña no cambia nada', () => {
		expect(inheritSpecColumns(fichaPadre, fichaPadre)).toBe(fichaPadre);
		expect(inheritSpecColumns(fichaFragmento, null)).toBe(fichaFragmento);
	});
});

describe('qué aprobación abre qué compuerta', () => {
	const delPortalEnElPadre: LineageApproval = { ot_id: 'ot-a', status: 'approved', confirmed_via: 'portal', recorded_by: PORTAL_ACTOR };
	const internaEnElPadre: LineageApproval = { ot_id: 'ot-a', status: 'approved', confirmed_via: 'presencial', recorded_by: 'u1' };
	const internaPropia: LineageApproval = { ot_id: 'ot-b', status: 'approved', confirmed_via: 'presencial', recorded_by: 'u1' };

	it('el visto bueno del cliente en el padre vale para comprar papel del fragmento', () => {
		expect(approvalOpensGate('paper_purchase', delPortalEnElPadre, 'ot-b')).toBe(true);
		expect(approvalOpensGate('paper_purchase', internaEnElPadre, 'ot-b')).toBe(true);
	});

	it('la revisión de calidad NO se hereda: cada fragmento sale por su propio despacho', () => {
		expect(approvalOpensGate('ready_for_delivery', internaEnElPadre, 'ot-b')).toBe(false);
		expect(approvalOpensGate('ready_for_delivery', internaPropia, 'ot-b')).toBe(true);
	});

	it('el portal sigue sin satisfacer la calidad interna, ni siquiera sobre la propia OT', () => {
		expect(approvalOpensGate('ready_for_delivery', { ...delPortalEnElPadre, ot_id: 'ot-b' }, 'ot-b')).toBe(false);
	});

	it('una fila que no está aprobada no abre nada', () => {
		expect(approvalOpensGate('paper_purchase', { ...internaEnElPadre, status: 'rejected' }, 'ot-b')).toBe(false);
	});
});

/**
 * El recorrido entero de un fragmento, con la evidencia como la arma `moveOT`:
 * leída del linaje y pasada por `approvalOpensGate`.
 */
describe('un fragmento llega a producción y sale por la puerta', () => {
	const aprobaciones: LineageApproval[] = [
		{ ot_id: 'ot-a', status: 'approved', confirmed_via: 'portal', recorded_by: PORTAL_ACTOR },
	];
	const mover = (fromStatus: OTWorkflowStatus, toStatus: OTWorkflowStatus, extra: { aprobaciones?: LineageApproval[]; costos?: boolean } = {}) =>
		validateTransition({
			fromStatus, toStatus, role: 'admin',
			hasApprovedApproval: (extra.aprobaciones ?? aprobaciones).some((a) => approvalOpensGate(toStatus, a, 'ot-b')),
			hasAnyRealCosts: extra.costos ?? true,
		});

	it('visto_bueno → paper_purchase con la firma que el cliente puso en el padre', () => {
		expect(mover('visto_bueno', 'paper_purchase').ok).toBe(true);
	});

	it('sin firma en ningún miembro del linaje, sigue frenado', () => {
		expect(mover('visto_bueno', 'paper_purchase', { aprobaciones: [] }).code).toBe('APPROVAL_REQUIRED');
	});

	it('recorre bodega, corte, prensa, troquel y revisión', () => {
		const ruta: OTWorkflowStatus[] = [
			'paper_purchase', 'in_storage', 'guillotine_first_cut', 'offset_printing',
			'die_cutting', 'guillotine_final_cut', 'workshop_revision',
		];
		for (let i = 0; i < ruta.length - 1; i++) expect(mover(ruta[i], ruta[i + 1]).ok).toBe(true);
	});

	it('para despacho pide SU revisión de calidad, no la del padre', () => {
		expect(mover('workshop_revision', 'ready_for_delivery').code).toBe('APPROVAL_REQUIRED');
		const conLaSuya = [...aprobaciones, { ot_id: 'ot-b', status: 'approved', confirmed_via: 'presencial', recorded_by: 'u1' }];
		expect(mover('workshop_revision', 'ready_for_delivery', { aprobaciones: conLaSuya }).ok).toBe(true);
	});

	it('devuelto a Pre-Prensa, vuelve a salir con la ficha de su dueña', () => {
		const fichaPadre = {
			id: 'ot-a', ot_number: '40879', sin_arte: false, die_source: 'existente', die_code: 'T-114', lamination_type: 'mate',
		};
		const fragmento = {
			id: 'ot-b', ot_number: '40879-B', client_id: 'c1', product_type: 'caja_plegadiza', quantity: 3000,
			width_cm: 20, height_cm: 30, substrate_type: 'cartulina', grammage_gsm: 300, color_front: 'cmyk',
			deadline: '2026-12-01', assigned_machine_id: 'r1', sin_arte: false,
			finish_troquelado: true, finish_laminado: true, die_source: null, die_code: null, lamination_type: null,
		};
		// Programa, operaciones y arte existen: cuelgan del padre y se cuentan sobre el linaje.
		const flags = { impositionConfirmed: true, operationsReviewed: true, artAttached: true };
		const base = { fromStatus: 'pre_press' as const, toStatus: 'visto_bueno' as const, role: 'admin' as const, hasApprovedApproval: false, hasAnyRealCosts: false };

		const sinHerencia = validateTransition({ ...base, spec: buildOTSpec(fragmento, flags) });
		expect(sinHerencia.code).toBe('SPEC_INCOMPLETE');
		expect(sinHerencia.gaps?.map((g) => g.field)).toEqual(['dieSource', 'laminationType']);

		const conHerencia = validateTransition({ ...base, spec: buildOTSpec(inheritSpecColumns(fragmento, fichaPadre), flags) });
		expect(conHerencia.ok).toBe(true);
	});
});
