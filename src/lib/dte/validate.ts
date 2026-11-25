import type { DteDocument, DteFieldError } from './types';
import { DTE_TYPES } from './types';

/**
 * Lo que el SII rechazaría, revisado ANTES de llamar al proveedor.
 *
 * Un rechazo del SII llega minutos después, en otra pantalla, con un código.
 * Lo mismo dicho acá —"falta el giro de Ferretería Malloco"— se arregla en el
 * momento y por quien está emitiendo. Por eso estas reglas viven en el núcleo
 * y no en el adaptador: valen para cualquier proveedor.
 */

/** "76.543.210-3" / "765432103" → "76543210-3", o null si no es un RUT. */
export function normalizeRut(input: string | null | undefined): string | null {
  if (!input) return null;
  const clean = input.replace(/[.\s]/g, '').replace(/‐|–|—/g, '-').toUpperCase();
  const m = /^(\d{1,8})-?([\dK])$/.exec(clean);
  if (!m) return null;
  return `${Number(m[1])}-${m[2]}`;
}

/** Dígito verificador por módulo 11. */
export function rutCheckDigit(body: number): string {
  let sum = 0;
  let factor = 2;
  for (let n = body; n > 0; n = Math.floor(n / 10)) {
    sum += (n % 10) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const r = 11 - (sum % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}

export function isValidRut(input: string | null | undefined): boolean {
  const n = normalizeRut(input);
  if (!n) return false;
  const [body, dv] = n.split('-');
  return rutCheckDigit(Number(body)) === dv;
}

const COMUNA = /^\d{5}$/;
const REGION = /^\d{1,2}$/;

export function validateDte(doc: DteDocument): DteFieldError[] {
  const e: DteFieldError[] = [];
  const r = doc.receptor;
  const who = r.razonSocial || 'el cliente';

  if (!isValidRut(r.rut)) e.push({ field: 'receptor.rut', message: `El RUT de ${who} no es válido`, rejectedValue: r.rut });
  if (!r.razonSocial?.trim()) e.push({ field: 'receptor.razonSocial', message: 'Falta la razón social del cliente' });
  else if (r.razonSocial.length > 100) e.push({ field: 'receptor.razonSocial', message: 'La razón social pasa de 100 caracteres' });
  if (!r.giro?.trim()) e.push({ field: 'receptor.giro', message: `Falta el giro de ${who}` });
  else if (r.giro.length > 40) e.push({ field: 'receptor.giro', message: `El giro de ${who} pasa de 40 caracteres` });
  if (!r.regionCode || !REGION.test(r.regionCode)) e.push({ field: 'receptor.regionCode', message: `Falta la región de ${who}` });
  if (!r.comunaCode || !COMUNA.test(r.comunaCode)) e.push({ field: 'receptor.comunaCode', message: `Falta el código de comuna de ${who} (5 dígitos)` });

  if (doc.lines.length === 0) e.push({ field: 'lines', message: 'El documento no tiene líneas' });
  doc.lines.forEach((l, i) => {
    const at = `lines[${i}]`;
    if (!l.description?.trim()) e.push({ field: `${at}.description`, message: `Línea ${i + 1}: falta la descripción` });
    else if (l.description.length > 80) e.push({ field: `${at}.description`, message: `Línea ${i + 1}: la descripción pasa de 80 caracteres` });
    if (!(l.quantity > 0)) e.push({ field: `${at}.quantity`, message: `Línea ${i + 1}: la cantidad debe ser mayor que cero` });
    if (!(l.unitPrice >= 0)) e.push({ field: `${at}.unitPrice`, message: `Línea ${i + 1}: el precio no puede ser negativo` });
    if (!l.uom || l.uom.length > 4) e.push({ field: `${at}.uom`, message: `Línea ${i + 1}: la unidad de medida va en 1 a 4 caracteres` });
  });

  if (doc.type === DTE_TYPES.FACTURA && !doc.lines.some((l) => l.afecto)) {
    e.push({ field: 'lines', message: 'Una factura afecta necesita al menos una línea afecta a IVA' });
  }
  if (doc.type === DTE_TYPES.FACTURA_EXENTA && doc.lines.some((l) => l.afecto)) {
    e.push({ field: 'lines', message: 'Una factura exenta no lleva líneas afectas a IVA' });
  }

  if (doc.type === DTE_TYPES.NOTA_CREDITO || doc.type === DTE_TYPES.NOTA_DEBITO) {
    const ref = doc.references?.[0];
    if (!ref) e.push({ field: 'references', message: 'Una nota debe referenciar el documento que corrige' });
    else {
      if (ref.totalAmount == null) e.push({ field: 'references[0].totalAmount', message: 'Falta el monto del documento referenciado' });
      if (ref.motive == null) e.push({ field: 'references[0].motive', message: 'Falta el motivo de la nota' });
    }
  }

  if (doc.type === DTE_TYPES.GUIA_DESPACHO) {
    const d = doc.dispatch;
    if (!d) e.push({ field: 'dispatch', message: 'Una guía de despacho necesita los datos del traslado' });
    else {
      if (!isValidRut(d.transportistaRut)) e.push({ field: 'dispatch.transportistaRut', message: 'Falta el RUT del transportista' });
      if (!isValidRut(d.choferRut)) e.push({ field: 'dispatch.choferRut', message: 'Falta el RUT del chofer' });
      if (!d.destinoComunaCode || !COMUNA.test(d.destinoComunaCode)) e.push({ field: 'dispatch.destinoComunaCode', message: 'Falta la comuna de destino' });
      if (d.patente && d.patente.length > 8) e.push({ field: 'dispatch.patente', message: 'La patente pasa de 8 caracteres' });
    }
  }

  if (doc.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(doc.dueDate)) {
    e.push({ field: 'dueDate', message: 'La fecha de vencimiento va como AAAA-MM-DD', rejectedValue: doc.dueDate });
  }
  return e;
}
