import { z } from 'zod';

/**
 * Upper bounds for quantities and money — one owner (audit C5, 2026-11-25).
 *
 * Quantity had no upper bound anywhere, so five QA drafts with 999,999,999
 * units put $166,753,224,623 into the sales pipeline. Every schema that takes
 * a quantity or an amount uses these helpers instead of a bare
 * `z.coerce.number().min(0)`, so the bound is the same at every door
 * (quote, OT, guide, invoice, purchase, capture).
 *
 * Sizing (real data, 2026-11-25): the largest OT is 592,000 units and
 * $54.4M CLP. The caps sit one to two orders of magnitude above that — they
 * stop typos and test junk, not a big real order.
 */
export const MAX_UNITS = 10_000_000;
/** Total of one document: an OT, a quote, an invoice, a purchase order. */
export const MAX_AMOUNT_CLP = 5_000_000_000;
/** Cost of one unit of one input (a sheet, a kg of ink, an hour). */
export const MAX_UNIT_COST_CLP = 1_000_000_000;

const tooMany = `La cantidad no puede pasar de ${MAX_UNITS.toLocaleString('es-CL')}`;
const tooMuch = `El monto no puede pasar de $${MAX_AMOUNT_CLP.toLocaleString('es-CL')}`;

/** A count of units (pieces, sheets, kg): ≥ 0 and ≤ MAX_UNITS. */
export const units = () => z.coerce.number().min(0).max(MAX_UNITS, tooMany);
/** A whole count of units. */
export const wholeUnits = () => units().int();
/** A money amount in CLP for a whole document: ≥ 0 and ≤ MAX_AMOUNT_CLP. */
export const amountCLP = () => z.coerce.number().min(0).max(MAX_AMOUNT_CLP, tooMuch);
/** The cost of one unit of an input. */
export const unitCostCLP = () => z.coerce.number().min(0).max(MAX_UNIT_COST_CLP, tooMuch);
