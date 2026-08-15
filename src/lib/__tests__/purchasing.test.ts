import { describe, expect, it } from 'vitest';

import {
	canEdit,
	canVoid,
	certPermiteRecibir,
	certStatus,
	invoiceArithmetic,
	ocActions,
	threeWayMatch,
} from '../purchasing';

describe('threeWayMatch', () => {
	it('todo calza: se puede pagar', () => {
		const r = threeWayMatch({ ordered: 1_000_000, received: 1_000_000, invoiced: 1_000_000 });
		expect(r.status).toBe('ok');
		expect(r.payable).toBe(true);
		expect(r.findings).toEqual([]);
	});

	// El caso caro: llega menos y facturan lo pedido.
	it('recibí 480 de 500 y me facturan 500', () => {
		const r = threeWayMatch({ ordered: 500_000, received: 480_000, invoiced: 500_000 });
		expect(r.status).toBe('con_diferencia');
		expect(r.payable).toBe(false);
		expect(r.receiptGap).toBe(20_000);
		expect(r.billingGap).toBe(-20_000);
		expect(r.findings.join(' ')).toContain('Cobran $20.000 más de lo que llegó');
	});

	// Las dos brechas van a personas distintas y por eso se reportan separadas.
	it('separa el problema de bodega del de cuentas por pagar', () => {
		const r = threeWayMatch({ ordered: 500_000, received: 480_000, invoiced: 480_000 });
		expect(r.receiptGap).toBe(20_000);
		expect(r.billingGap).toBe(0);
		expect(r.findings.join(' ')).toContain('Lo ve bodega');
		// Llegó de menos pero cobran lo que llegó: no bloquea el pago.
		expect(r.status).toBe('en_revision');
	});

	// La razón de fondo para no netear, demostrada: con los DOS problemas
	// presentes, la suma de las brechas da exactamente cero. Un solo indicador
	// de «diferencia» habría mostrado que está todo bien.
	it('llegó de menos y facturan lo pedido: la suma da cero y hay dos problemas', () => {
		const r = threeWayMatch({ ordered: 500_000, received: 400_000, invoiced: 500_000 });
		expect(r.receiptGap + r.billingGap).toBe(0);
		expect(r.findings).toHaveLength(2);
		expect(r.payable).toBe(false);
	});

	it('una diferencia dentro de la tolerancia no molesta a nadie', () => {
		const r = threeWayMatch({ ordered: 1_000_000, received: 995_000, invoiced: 995_000 });
		expect(r.status).toBe('ok');
	});

	it('facturar antes de recibir se frena', () => {
		const r = threeWayMatch({ ordered: 500_000, received: 0, invoiced: 500_000 });
		expect(r.payable).toBe(false);
		expect(r.findings[0]).toContain('todavía no se recibió nada');
	});

	it('recibido sin factura todavía no es un problema de pago', () => {
		const r = threeWayMatch({ ordered: 500_000, received: 500_000, invoiced: 0 });
		expect(r.status).toBe('ok');
	});

	it('facturaron de menos: falta una factura, no se bloquea', () => {
		const r = threeWayMatch({ ordered: 500_000, received: 500_000, invoiced: 300_000 });
		expect(r.status).toBe('en_revision');
		expect(r.findings.join(' ')).toContain('Falta una factura');
	});
});

describe('invoiceArithmetic', () => {
	it('neto más IVA da el total', () => {
		expect(invoiceArithmetic(1_000_000, 190_000, 1_190_000).ok).toBe(true);
	});

	// Un dígito de más pasa desapercibido semanas y desordena el costo de toda
	// OT que tocó ese papel.
	it('un total que no cuadra se atrapa en la puerta', () => {
		const r = invoiceArithmetic(1_000_000, 190_000, 1_900_000);
		expect(r.ok).toBe(false);
		expect(r.message).toContain('$1.190.000');
	});

	it('tolera el redondeo del emisor', () => {
		expect(invoiceArithmetic(1_000_000, 190_000, 1_190_001).ok).toBe(true);
	});

	// Avisa pero no bloquea: hay exentas y hay notas con otra tasa.
	it('un IVA que no es 19% avisa sin rechazar', () => {
		const r = invoiceArithmetic(1_000_000, 100_000, 1_100_000);
		expect(r.ok).toBe(true);
		expect(r.message).toContain('no es el 19%');
		expect(r.expectedVat).toBe(190_000);
	});

	it('una factura exenta no se traba', () => {
		expect(invoiceArithmetic(1_000_000, 0, 1_000_000).ok).toBe(true);
	});
});

describe('certStatus', () => {
	const hoy = new Date('2026-08-16T12:00:00Z');

	it('vigente, por vencer y vencido', () => {
		expect(certStatus('2027-01-01', hoy)).toBe('vigente');
		expect(certStatus('2026-09-01', hoy)).toBe('por_vencer');
		expect(certStatus('2026-08-01', hoy)).toBe('vencido');
	});

	// Son fallas distintas: una es del proveedor, la otra es nuestra por no
	// habérselo pedido.
	it('distingue vencido de no tenerlo', () => {
		expect(certStatus(null, hoy)).toBe('sin_certificado');
		expect(certStatus('', hoy)).toBe('sin_certificado');
	});

	it('vencido y sin certificado no dejan recibir sin autorización', () => {
		expect(certPermiteRecibir(certStatus('2026-08-01', hoy))).toBe(false);
		expect(certPermiteRecibir(certStatus(null, hoy))).toBe(false);
		expect(certPermiteRecibir(certStatus('2027-01-01', hoy))).toBe(true);
		// Por vencer sí deja: todavía es válido y frenarlo pararía la planta.
		expect(certPermiteRecibir(certStatus('2026-09-01', hoy))).toBe(true);
	});
});

describe('el estado manda qué se puede hacer', () => {
	it('sólo un borrador se edita', () => {
		expect(canEdit('draft')).toBe(true);
		expect(canEdit('sent')).toBe(false);
		expect(canEdit('received')).toBe(false);
	});

	it('se anula lo emitido; un borrador se descarta y lo cerrado no se toca', () => {
		expect(canVoid('draft')).toBe(false);
		expect(canVoid('sent')).toBe(true);
		expect(canVoid('invoiced')).toBe(true);
		expect(canVoid('closed')).toBe(false);
		expect(canVoid('cancelled')).toBe(false);
	});

	it('una OC anulada no acepta nada', () => {
		const a = ocActions('cancelled');
		expect(Object.values(a).every((v) => v === false)).toBe(true);
	});

	it('un borrador se emite y no se recibe', () => {
		const a = ocActions('draft');
		expect(a.emitir).toBe(true);
		expect(a.recibir).toBe(false);
	});
});
