import { describe, expect, it } from 'vitest';

import {
	CAPTURE_STATUS_LABELS,
	DISPATCH_STATUS_LABELS,
	EMPLOYEE_STATUS_LABELS,
	MAINTENANCE_STATUS_LABELS,
	OC_STATUS_LABELS,
	OT_STATUS_LABELS,
	PURCHASE_INVOICE_STATUS_LABELS,
	SALES_INVOICE_STATUS_LABELS,
	VB_STATUS_LABELS,
	captureStatusLabel,
	dispatchStatusLabel,
	ocStatusLabel,
	otStatusLabel,
	salesInvoiceStatusLabel,
	statusBadgeClass,
	vbStatusLabel,
} from '../status-labels';

/**
 * Los valores vienen de `Database['public']['Enums']`. Se copian acá a
 * propósito: si alguien agrega un estado al enum de la base y no lo traduce, la
 * prueba falla y el estado no llega crudo a la pantalla del cliente.
 */
const ENUMS: Record<string, { valores: string[]; mapa: Record<string, string> }> = {
	ot_status: {
		valores: ['pre_press', 'visto_bueno', 'paper_purchase', 'in_storage', 'guillotine_first_cut',
			'offset_printing', 'digital_printing', 'die_cutting', 'guillotine_final_cut', 'workshop',
			'outsourced', 'workshop_revision', 'ready_for_delivery', 'in_delivery', 'completed'],
		mapa: OT_STATUS_LABELS,
	},
	vb_status: {
		valores: ['draft', 'sent', 'signed', 'converted', 'rejected', 'expired'],
		mapa: VB_STATUS_LABELS,
	},
	oc_status: {
		valores: ['draft', 'sent', 'received', 'invoiced', 'closed', 'cancelled'],
		mapa: OC_STATUS_LABELS,
	},
	sales_invoice_status: {
		valores: ['issued', 'sent', 'paid', 'cancelled'],
		mapa: SALES_INVOICE_STATUS_LABELS,
	},
	factura_compra_status: {
		valores: ['received', 'matched', 'disputed', 'paid'],
		mapa: PURCHASE_INVOICE_STATUS_LABELS,
	},
	dispatch_status: {
		valores: ['draft', 'dispatched', 'delivered', 'cancelled'],
		mapa: DISPATCH_STATUS_LABELS,
	},
	capture_status: {
		valores: ['pending', 'approved', 'auto_approved', 'rejected', 'needs_revision'],
		mapa: CAPTURE_STATUS_LABELS,
	},
	employee_status: {
		valores: ['active', 'inactive', 'on_leave', 'terminated'],
		mapa: EMPLOYEE_STATUS_LABELS,
	},
	maintenance_status: {
		valores: ['scheduled', 'in_progress', 'completed', 'cancelled', 'overdue'],
		mapa: MAINTENANCE_STATUS_LABELS,
	},
};

describe('ningún estado de la base llega crudo a la pantalla', () => {
	for (const [enumName, { valores, mapa }] of Object.entries(ENUMS)) {
		it(`${enumName}: los ${valores.length} valores tienen etiqueta en español`, () => {
			for (const v of valores) {
				expect(mapa[v], `falta traducir «${v}» de ${enumName}`).toBeTruthy();
				// Traducido de verdad, no el mismo valor con otra cara.
				expect(mapa[v]).not.toBe(v);
			}
		});
	}
});

describe('el respaldo cuando el valor no está en el mapa', () => {
	it('un estado desconocido se lee como texto, no como clave de base de datos', () => {
		// Devolverlo crudo parece un error de la app; devolverlo vacío no
		// distingue «sin estado» de «se rompió algo».
		expect(vbStatusLabel('nuevo_estado_raro')).toBe('Nuevo estado raro');
	});

	it('sin valor devuelve una raya, nunca vacío', () => {
		expect(vbStatusLabel(null)).toBe('—');
		expect(ocStatusLabel(undefined)).toBe('—');
		expect(otStatusLabel(null)).toBe('—');
		expect(dispatchStatusLabel('')).toBe('—');
	});
});

describe('el semáforo comercial', () => {
	it('pagada y entregada se ven distinto de anulada', () => {
		expect(statusBadgeClass('paid')).toBe(statusBadgeClass('delivered'));
		expect(statusBadgeClass('paid')).not.toBe(statusBadgeClass('cancelled'));
	});

	it('lo que espera a alguien va en ámbar', () => {
		expect(statusBadgeClass('pending')).toBe(statusBadgeClass('needs_revision'));
		expect(statusBadgeClass('pending')).not.toBe(statusBadgeClass('paid'));
	});

	it('un estado desconocido no rompe el chip', () => {
		expect(statusBadgeClass('vaya_uno_a_saber')).toBeTruthy();
		expect(statusBadgeClass(null)).toBeTruthy();
	});
});

describe('las etiquetas hablan del negocio, no del sistema', () => {
	it('«converted» dice en qué se convirtió', () => {
		expect(vbStatusLabel('converted')).toBe('Convertido en OT');
	});

	it('«matched» dice contra qué se cuadró', () => {
		// «Cuadrada» a secas deja al usuario preguntándose con qué.
		expect(ocStatusLabel('sent')).toContain('proveedor');
	});

	it('«auto_approved» distingue quién aprobó', () => {
		expect(captureStatusLabel('auto_approved')).not.toBe(captureStatusLabel('approved'));
	});

	it('una factura emitida no es lo mismo que una pagada', () => {
		expect(salesInvoiceStatusLabel('issued')).not.toBe(salesInvoiceStatusLabel('paid'));
	});
});
