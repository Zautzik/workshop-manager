import { describe, expect, it } from 'vitest';
import { dispatchClosed, invoiceNetForDispatch } from '../dispatch-billing';

describe('factura por despacho: se redondea una sola vez (auditoría M7)', () => {
  const ot = { ordered: 3, quoted: 100 };

  it('tres entregas de 1 suman exactamente lo cotizado', () => {
    const a = invoiceNetForDispatch({ ...ot, units: 1, alreadyInvoicedUnits: 0, alreadyInvoicedNet: 0 });
    const b = invoiceNetForDispatch({ ...ot, units: 1, alreadyInvoicedUnits: 1, alreadyInvoicedNet: a });
    const c = invoiceNetForDispatch({ ...ot, units: 1, alreadyInvoicedUnits: 2, alreadyInvoicedNet: a + b });
    expect([a, b]).toEqual([33, 33]);
    expect(c).toBe(34);
    expect(a + b + c).toBe(100);
  });

  it('el caso real: 21.597.937 en dos facturas no da 21.597.938', () => {
    const big = { ordered: 42_000, quoted: 21_597_937 };
    const a = invoiceNetForDispatch({ ...big, units: 21_001, alreadyInvoicedUnits: 0, alreadyInvoicedNet: 0 });
    const b = invoiceNetForDispatch({ ...big, units: 20_999, alreadyInvoicedUnits: 21_001, alreadyInvoicedNet: a });
    expect(a + b).toBe(21_597_937);
  });

  it('una sola factura por todo es el precio cotizado', () => {
    expect(invoiceNetForDispatch({ ...ot, units: 3, alreadyInvoicedUnits: 0, alreadyInvoicedNet: 0 })).toBe(100);
  });

  it('despacho cerrado = todo despachado y todo facturado', () => {
    expect(dispatchClosed({ dispatched_pct: 100, invoiced_total: 100, quoted_price: 100 })).toBe(true);
    expect(dispatchClosed({ dispatched_pct: 100, invoiced_total: 99, quoted_price: 100 })).toBe(true); // $1 de redondeo viejo
    expect(dispatchClosed({ dispatched_pct: 100, invoiced_total: 0, quoted_price: 100 })).toBe(false);
    expect(dispatchClosed({ dispatched_pct: 60, invoiced_total: 100, quoted_price: 100 })).toBe(false);
  });
});
