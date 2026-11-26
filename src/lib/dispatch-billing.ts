/**
 * The net amount of a sales invoice that bills dispatched units — rounded once.
 *
 * Each partial invoice used to round its own share (units × quoted/ordered) to
 * whole pesos, so an OT billed in three parts could add up to $1 more or less
 * than its quote (Despachos showed 21.597.937 quoted vs 21.597.938 invoiced —
 * audit M7). The invoice that completes the OT now takes the remainder:
 * quoted − what was already invoiced. The parts always add up to the quote.
 */
export interface InvoiceNetInput {
  /** Units the OT was quoted for. */
  ordered: number;
  /** The OT's net quoted price. */
  quoted: number;
  /** Units dispatched in the guides of THIS invoice. */
  units: number;
  /** Units already billed by earlier, non-cancelled invoices of the OT. */
  alreadyInvoicedUnits: number;
  /** Net already billed by those invoices. */
  alreadyInvoicedNet: number;
}

export function invoiceNetForDispatch(i: InvoiceNetInput): number {
  const completes = i.alreadyInvoicedUnits + i.units >= i.ordered;
  if (completes) return Math.max(0, Math.round(i.quoted - i.alreadyInvoicedNet));
  return Math.round(i.units * (i.quoted / i.ordered));
}

/**
 * Despachos' two lists: an OT is closed when everything was dispatched and
 * everything was invoiced (within $1 of rounding on older invoices).
 */
export function dispatchClosed(row: { dispatched_pct: number; invoiced_total: number; quoted_price: number }): boolean {
  return row.dispatched_pct >= 100 && row.quoted_price > 0 && row.invoiced_total >= row.quoted_price - 1;
}
