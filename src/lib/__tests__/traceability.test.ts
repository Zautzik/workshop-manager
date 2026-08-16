import { describe, expect, it } from 'vitest';

import {
	checkLotUse,
	decodeLotQR,
	encodeLotQR,
	esNumeroPropio,
	verdictExplanation,
	type LotForUse,
} from '../traceability';

const UUID = '65216929-57f3-4a9c-8d84-123614e56f57';

const lote = (extra: Partial<LotForUse> = {}): LotForUse => ({
	lotNumber: 'L-2608-0001',
	quantityAvailable: 500,
	certificationCode: 'CERT-1001',
	certificationExpiresOn: '2027-01-01',
	requiresCert: true,
	minDaysValid: 0,
	overrideRole: 'Jefe de Calidad',
	...extra,
});

describe('el código impreso', () => {
	it('va y vuelve', () => {
		expect(decodeLotQR(encodeLotQR(UUID))).toEqual({ ok: true, lotId: UUID, problem: null });
	});

	it('usa el formato que el taller ya tiene', () => {
		expect(encodeLotQR(UUID)).toBe(`WH:LOT:${UUID}`);
	});

	// Un operario con el pallet delante no puede quedar trabado por un espacio.
	it('tolera espacios y minúsculas', () => {
		expect(decodeLotQR(`  wh:lot:${UUID}  `).lotId).toBe(UUID);
	});

	it('acepta el id pelado y el que viene dentro de una URL', () => {
		expect(decodeLotQR(UUID).ok).toBe(true);
		expect(decodeLotQR(`https://taller.cl/lotes/${UUID}`).lotId).toBe(UUID);
	});

	// Escanear la etiqueta equivocada tiene que decir CUÁL es el problema.
	it('distingue otro QR del taller de uno ajeno', () => {
		expect(decodeLotQR('WH:RECV:abc').problem).toContain('no de un lote de papel');
		expect(decodeLotQR('hola').problem).toContain('no es de este sistema');
		expect(decodeLotQR('').problem).toContain('No se leyó nada');
	});

	it('un lote con el código cortado no pasa por bueno', () => {
		expect(decodeLotQR('WH:LOT:123').ok).toBe(false);
	});
});

describe('el número de lote', () => {
	it('reconoce el nuestro', () => {
		expect(esNumeroPropio('L-2608-0001')).toBe(true);
	});

	// El del proveedor es el que figura en su certificado: en un retiro es el
	// que hay que citar, así que no se puede confundir con el nuestro.
	it('el del proveedor no es el nuestro', () => {
		expect(esNumeroPropio('BOBINA-77841/A')).toBe(false);
		expect(esNumeroPropio('OC-00021-L231752')).toBe(false);
		expect(esNumeroPropio(null)).toBe(false);
	});
});

describe('checkLotUse', () => {
	const hoy = new Date('2026-08-16T12:00:00Z');

	it('certificado vigente y saldo: sale sin que nadie firme', () => {
		const r = checkLotUse(lote(), 100, hoy);
		expect(r.allowed).toBe(true);
		expect(r.needsOverride).toBe(false);
	});

	// La retención es una decisión humana y gana sobre cualquier cálculo.
	it('un lote retenido no sale, ni con autorización', () => {
		const r = checkLotUse(lote({ blockedReason: 'En cuarentena por humedad' }), 10, hoy);
		expect(r.allowed).toBe(false);
		expect(r.needsOverride).toBe(false);
		expect(r.message).toContain('En cuarentena por humedad');
	});

	it('no se saca más de lo que hay', () => {
		const r = checkLotUse(lote({ quantityAvailable: 80 }), 100, hoy);
		expect(r.reason).toBe('sin_saldo');
		expect(r.message).toContain('Quedan 80');
	});

	// El caso que motivó poner la puerta también en la salida: el certificado
	// vence estando el papel en bodega.
	it('vencido en bodega: se puede sacar sólo con autorización', () => {
		const r = checkLotUse(lote({ certificationExpiresOn: '2026-08-04' }), 100, hoy);
		expect(r.allowed).toBe(false);
		expect(r.needsOverride).toBe(true);
		expect(r.reason).toBe('certificado_vencido');
		expect(r.message).toContain('venció hace 12 días');
		expect(r.message).toContain('Jefe de Calidad');
	});

	it('sin certificado no es lo mismo que vencido', () => {
		const r = checkLotUse(lote({ certificationExpiresOn: null, certificationCode: null }), 10, hoy);
		expect(r.reason).toBe('sin_certificado');
		expect(r.needsOverride).toBe(true);
	});

	// Un material que no toca el producto no tiene por qué exigir certificado:
	// pedirlo igual termina con alguien inventando un número para poder seguir.
	it('un material que no lo exige sale sin mirar el certificado', () => {
		const r = checkLotUse(lote({ requiresCert: false, certificationExpiresOn: '2020-01-01' }), 10, hoy);
		expect(r.allowed).toBe(true);
	});

	// El margen es lo que evita que venza a mitad del tiraje.
	it('respeta los días de margen de la política', () => {
		const conMargen = lote({ certificationExpiresOn: '2026-08-30', minDaysValid: 30 });
		const r = checkLotUse(conMargen, 10, hoy);
		expect(r.needsOverride).toBe(true);
		expect(r.message).toContain('la política pide 30');
		// Con margen 0 el mismo lote sale sin problema.
		expect(checkLotUse({ ...conMargen, minDaysValid: 0 }, 10, hoy).allowed).toBe(true);
	});

	it('el saldo se mira antes que el certificado: es lo que el operario ve primero', () => {
		const r = checkLotUse(lote({ quantityAvailable: 5, certificationExpiresOn: '2020-01-01' }), 100, hoy);
		expect(r.reason).toBe('sin_saldo');
	});
});

describe('verdictExplanation', () => {
	it('conforme dice cuántos lotes lo sostienen', () => {
		expect(
			verdictExplanation({
				veredicto: 'conforme', lotes_consumidos: 3,
				lotes_sin_certificado: 0, lotes_vencidos_al_usar: 0, lotes_con_desviacion: 0,
			}),
		).toContain('3 lotes con certificado vigente');
	});

	// «No conforme» sin motivo obliga a ir a buscar, que es justo el tiempo que
	// no hay durante un simulacro de retiro.
	it('no conforme dice por qué, sumando las dos causas', () => {
		const t = verdictExplanation({
			veredicto: 'no_conforme', lotes_consumidos: 4,
			lotes_sin_certificado: 1, lotes_vencidos_al_usar: 2, lotes_con_desviacion: 0,
		});
		expect(t).toContain('1 sin certificado');
		expect(t).toContain('2 con el certificado vencido');
	});

	it('la desviación autorizada dice que quedó registrada', () => {
		expect(
			verdictExplanation({
				veredicto: 'con_desviacion_autorizada', lotes_consumidos: 2,
				lotes_sin_certificado: 0, lotes_vencidos_al_usar: 0, lotes_con_desviacion: 1,
			}),
		).toContain('quién la dio');
	});

	it('sin consumo no es un problema, es un estado', () => {
		expect(
			verdictExplanation({
				veredicto: 'sin_consumo', lotes_consumidos: 0,
				lotes_sin_certificado: 0, lotes_vencidos_al_usar: 0, lotes_con_desviacion: 0,
			}),
		).toContain('Todavía no se consumió');
	});
});
