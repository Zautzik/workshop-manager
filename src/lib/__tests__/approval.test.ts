import { describe, expect, it } from 'vitest';

import {
	approvalState,
	approvalSummary,
	BOUNCES_TO,
	nextRound,
	RECOVERABLE_VIA,
	validateApproval,
	type ApprovalInput,
	type ApprovalRow,
} from '../approval';

const aprobacion = (extra: Partial<ApprovalInput> = {}): ApprovalInput => ({
	decision: 'approved',
	confirmedVia: 'correo',
	approverName: 'Marcela Ibáñez',
	proofedOn: 'pdf',
	...extra,
});

const fila = (extra: Partial<ApprovalRow> = {}): ApprovalRow => ({
	decision: 'approved',
	round: 1,
	approver_name: 'Marcela Ibáñez',
	decided_at: '2026-08-15T12:00:00Z',
	...extra,
});

describe('validateApproval', () => {
	it('acepta una aprobación con medio, contacto y contra qué se aprobó', () => {
		expect(validateApproval(aprobacion())).toEqual([]);
	});

	// El vendedor es el eslabón: lo que se le exige es decir por dónde llegó el
	// sí, porque es lo único que después se puede ir a buscar.
	it('sin decir cómo lo confirmó el cliente, no se guarda', () => {
		const errores = validateApproval(aprobacion({ confirmedVia: null }));
		expect(errores.map((e) => e.field)).toEqual(['confirmedVia']);
	});

	// El contacto del cliente muchas veces no se sabe, y forzarlo es lo que
	// produce rellenos como 'Cliente'.
	it('el nombre del contacto puede faltar', () => {
		expect(validateApproval(aprobacion({ approverName: null }))).toEqual([]);
		expect(validateApproval(aprobacion({ approverName: '' }))).toEqual([]);
	});

	// La regresión que motivó todo esto: `signed_by_name: 'Cliente'`.
	it('rechaza «Cliente» como contacto: el relleno miente, el vacío no', () => {
		const errores = validateApproval(aprobacion({ approverName: 'Cliente' }));
		expect(errores).toHaveLength(1);
		expect(errores[0].field).toBe('approverName');
		expect(errores[0].message).toContain('no identifica a nadie');
	});

	it('rechaza el relleno en cualquier capitalización y con espacios', () => {
		for (const relleno of ['  CLIENTE ', 'n/a', 'X', 'prueba']) {
			expect(validateApproval(aprobacion({ approverName: relleno }))).toHaveLength(1);
		}
	});

	it('un espacio en blanco cuenta como no saberlo, no como error', () => {
		expect(validateApproval(aprobacion({ approverName: '  ' }))).toEqual([]);
	});

	it('un rechazo sin motivo no se guarda', () => {
		const errores = validateApproval({
			decision: 'rejected',
			confirmedVia: 'telefono',
			approverName: 'Pablo Soto',
		});
		expect(errores.map((e) => e.field)).toEqual(['rejectReason']);
	});

	it('un rechazo no necesita decir contra qué se probó', () => {
		const errores = validateApproval({
			decision: 'rejected',
			confirmedVia: 'whatsapp',
			approverName: 'Pablo Soto',
			rejectReason: 'color',
		});
		expect(errores).toEqual([]);
	});

	it('una aprobación sí lo necesita: un PDF no aprueba color', () => {
		const errores = validateApproval(aprobacion({ proofedOn: null }));
		expect(errores.map((e) => e.field)).toEqual(['proofedOn']);
	});

	it('valida el correo cuando viene, y lo deja pasar cuando no', () => {
		expect(validateApproval(aprobacion({ approverEmail: 'no-es-correo' }))).toHaveLength(1);
		expect(validateApproval(aprobacion({ approverEmail: 'm@acme.cl' }))).toEqual([]);
		expect(validateApproval(aprobacion({ approverEmail: null }))).toEqual([]);
	});

	it('devuelve todos los problemas juntos, no el primero', () => {
		const errores = validateApproval({ decision: 'rejected', approverName: 'Cliente' });
		expect(errores.map((e) => e.field).sort()).toEqual([
			'approverName',
			'confirmedVia',
			'rejectReason',
		]);
	});
});

describe('qué medios dejan rastro', () => {
	it('correo, WhatsApp y el enlace se pueden ir a buscar; teléfono y presencial no', () => {
		expect([...RECOVERABLE_VIA].sort()).toEqual(['correo', 'portal', 'whatsapp']);
		expect(RECOVERABLE_VIA).not.toContain('telefono');
		expect(RECOVERABLE_VIA).not.toContain('presencial');
	});
});

describe('nextRound', () => {
	it('la primera vuelta es la 1', () => {
		expect(nextRound([])).toBe(1);
	});

	it('sigue de la más alta, aunque falten intermedias', () => {
		expect(nextRound([fila({ round: 1 }), fila({ round: 3 })])).toBe(4);
	});

	it('una vuelta mandada y sin responder igual cuenta', () => {
		expect(nextRound([fila({ round: 1, decision: null })])).toBe(2);
	});
});

describe('approvalState', () => {
	it('sin filas, no hay nada aprobado', () => {
		const s = approvalState([]);
		expect(s.approved).toBe(false);
		expect(s.rounds).toBe(0);
		expect(s.last).toBeNull();
	});

	it('una vuelta mandada y sin responder no aprueba nada', () => {
		const s = approvalState([fila({ decision: null })]);
		expect(s.approved).toBe(false);
		expect(s.rounds).toBe(1);
	});

	// Lo que importa es la última, no que exista alguna.
	it('un rechazo posterior a una aprobación deja el trabajo sin aprobar', () => {
		const s = approvalState([
			fila({ round: 1, decision: 'approved' }),
			fila({ round: 2, decision: 'rejected', reject_reason: 'texto' }),
		]);
		expect(s.approved).toBe(false);
		expect(s.bouncedTo).toBe('Diseño');
	});

	it('una aprobación posterior a dos rechazos sí aprueba', () => {
		const s = approvalState([
			fila({ round: 1, decision: 'rejected', reject_reason: 'color' }),
			fila({ round: 2, decision: 'rejected', reject_reason: 'texto' }),
			fila({ round: 3, decision: 'approved' }),
		]);
		expect(s.approved).toBe(true);
		expect(s.rejections).toBe(2);
		expect(s.bouncedTo).toBeNull();
	});

	it('no depende del orden en que vienen las filas', () => {
		const desordenadas = [
			fila({ round: 3, decision: 'approved' }),
			fila({ round: 1, decision: 'rejected', reject_reason: 'color' }),
		];
		expect(approvalState(desordenadas).approved).toBe(true);
	});

	it('cada motivo manda el trabajo a un lugar distinto', () => {
		expect(BOUNCES_TO.texto).toBe('Diseño');
		expect(BOUNCES_TO.color).toBe('Prensa');
		expect(BOUNCES_TO.estructura).toBe('Troquelado');
	});
});

describe('approvalSummary', () => {
	it('dice quién aprobó, por dónde y contra qué', () => {
		const s = approvalState([fila({ proofed_on: 'prueba_fisica', confirmed_via: 'correo' })]);
		expect(approvalSummary(s)).toBe('Aprobado por Marcela Ibáñez por correo contra prueba física.');
	});

	// Sin contacto anotado la frase no puede sonar a que se sabe quién fue.
	it('sin nombre de contacto dice «el cliente», no un relleno', () => {
		const s = approvalState([fila({ approver_name: null, confirmed_via: 'telefono', proofed_on: 'pdf' })]);
		expect(approvalSummary(s)).toBe('Aprobado por el cliente por teléfono contra pdf.');
	});

	it('menciona la vuelta cuando hubo más de una', () => {
		const s = approvalState([
			fila({ round: 1, decision: 'rejected', reject_reason: 'texto' }),
			fila({ round: 2, decision: 'approved', proofed_on: 'pdf' }),
		]);
		expect(approvalSummary(s)).toContain('a la vuelta 2');
	});

	it('un rechazo dice a dónde vuelve el trabajo', () => {
		const s = approvalState([fila({ decision: 'rejected', reject_reason: 'estructura' })]);
		expect(approvalSummary(s)).toContain('Vuelve a Troquelado');
	});

	it('distingue «no se mandó» de «se mandó y no contestan»', () => {
		expect(approvalSummary(approvalState([]))).toContain('Todavía no se mandó');
		expect(approvalSummary(approvalState([fila({ decision: null })]))).toContain('esperando respuesta');
	});
});
