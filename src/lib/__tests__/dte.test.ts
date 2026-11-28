import { describe, expect, it, vi } from 'vitest';
import {
  dteConfigStatus, getDteProvider, isValidRut, normalizeRut, rutCheckDigit, validateDte,
  type DteDocument,
} from '@/lib/dte';
import { NuboxProvider, normalizeStatus, toNuboxSale } from '@/lib/dte/nubox';

const factura = (over: Partial<DteDocument> = {}): DteDocument => ({
  type: 33,
  receptor: {
    rut: '83.383.100-3',
    razonSocial: 'Ferretería Malloco SpA',
    giro: 'Venta de artículos de ferretería',
    email: 'compras@example.cl',
    direccion: 'Av. Siempre Viva 123',
    ciudad: 'Santiago',
    regionCode: '13',
    comunaCode: '13101',
  },
  lines: [{ productCode: 'OT 41242', description: 'Etiqueta autoadhesiva', quantity: 6000, unitPrice: 56.4257, uom: 'UNID', afecto: true }],
  paymentForm: 2,
  dueDate: '2026-12-25',
  ...over,
});

describe('RUT', () => {
  it('valida con módulo 11 y normaliza el formato', () => {
    expect(rutCheckDigit(83383100)).toBe('3');
    expect(isValidRut('83.383.100-3')).toBe(true);
    expect(isValidRut('83383100-4')).toBe(false);
    expect(isValidRut('76.543.210-K')).toBe(false); // el relleno viejo de company.ts
    expect(normalizeRut(' 83.383.100-3 ')).toBe('83383100-3');
    expect(normalizeRut('no es rut')).toBeNull();
  });
});

describe('validateDte', () => {
  it('acepta una factura completa', () => {
    expect(validateDte(factura())).toEqual([]);
  });

  it('dice qué falta del cliente antes de llamar al proveedor', () => {
    const errs = validateDte(factura({ receptor: { ...factura().receptor, giro: null, comunaCode: '131' } }));
    expect(errs.map((e) => e.field)).toEqual(['receptor.giro', 'receptor.comunaCode']);
    expect(errs[0].message).toContain('Ferretería Malloco');
  });

  it('exige una línea afecta en factura y ninguna en exenta', () => {
    const sinAfecta = factura({ lines: [{ ...factura().lines[0], afecto: false }] });
    expect(validateDte(sinAfecta).some((e) => e.field === 'lines')).toBe(true);
    expect(validateDte({ ...factura(), type: 34 }).some((e) => e.field === 'lines')).toBe(true);
  });

  it('una guía necesita transportista, chofer y comuna de destino', () => {
    const guia = factura({ type: 52, dispatch: { transportistaRut: null, choferRut: '83.383.100-3', destinoComunaCode: null, indicadorTraslado: 1 } });
    expect(validateDte(guia).map((e) => e.field)).toEqual(['dispatch.transportistaRut', 'dispatch.destinoComunaCode']);
  });

  it('una nota de crédito necesita referencia con monto y motivo', () => {
    const nc = factura({ type: 61, references: [{ type: 33, folio: '1201', date: '2026-11-20' }] });
    expect(validateDte(nc).map((e) => e.field)).toEqual(['references[0].totalAmount', 'references[0].motive']);
  });
});

describe('toNuboxSale', () => {
  it('arma el elemento de /v1/sales/issuance con los nombres de la documentación', () => {
    const s = toNuboxSale(factura(), 1) as any;
    expect(s.sequence).toBe(1);
    expect(s.type).toEqual({ legalCode: '33' });
    expect(s.client.identification).toEqual({ type: 1, value: '83383100-3' });
    expect(s.client.mainActivity).toBe('Venta de artículos de ferretería');
    expect(s.client.territorialDivisionLegalCode).toBe('13');
    expect(s.client.territorialDivisionL2LegalCode).toBe('13101');
    expect(s.saleType).toEqual({ id: 1 });
    expect(s.paymentForm).toEqual({ id: 2 });
    expect(s.dueDate).toBe('2026-12-25');
    expect(s.details[0]).toEqual({
      order: 1, productCode: 'OT41242', quantity: 6000, productDescription: 'Etiqueta autoadhesiva',
      subjectToTax: true, uom: { code: 'UNID' }, price: 56.4257,
    });
    expect(s.references).toBeUndefined();
    expect(s.dispatchGuideDetail).toBeUndefined();
  });

  it('referencia las guías con la fecha en el formato con zona', () => {
    const s = toNuboxSale(factura({ references: [{ type: 52, folio: '881', date: '2026-11-20' }] }), 1) as any;
    expect(s.references[0]).toEqual({ legalCode: '52', documentNumber: '881', documentEmissionDate: '2026-11-20T12:00:00.000-04:00' });
  });

  it('una guía de despacho lleva dispatchGuideDetail', () => {
    const s = toNuboxSale(factura({
      type: 52,
      dispatch: { transportistaRut: '83.383.100-3', choferRut: '83383100-3', choferNombre: 'Juan Pérez', patente: 'ABCD12', destinoComunaCode: '13101', indicadorTraslado: 1 },
    }), 1) as any;
    expect(s.dispatchGuideDetail).toEqual({
      driver: { name: 'Juan Pérez', identification: { type: 1, value: '83383100-3' } },
      conveyor: { identification: { type: 1, value: '83383100-3' } },
      licensePlate: 'ABCD12',
      destination: { territorialDivisionL2LegalCode: '13101' },
      transferType: { id: 1 },
    });
  });
});

describe('NuboxProvider', () => {
  const cfg = { baseUrl: 'https://uat.nubox.example/', secretKey: 'sk', apiKey: 'ak' };
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('emite con las cabeceras de la documentación y queda pendiente, no aceptada', async () => {
    const fetchImpl = vi.fn(async () => json(207, [{ id: 9911, sequence: 1, type: { legalCode: '33' }, errors: null }]));
    const p = new NuboxProvider({ ...cfg, fetchImpl: fetchImpl as any });
    const r = await p.issue(factura(), '6f1c2a5e-0000-4000-8000-000000000001');

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://uat.nubox.example/v1/sales/issuance');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'sk', 'X-Api-Key': 'ak', 'X-Idempotence-id': '6f1c2a5e-0000-4000-8000-000000000001' });
    expect(JSON.parse(String(init.body))).toHaveLength(1);
    expect(r).toMatchObject({ ok: true, providerId: '9911', status: 'pending', folio: null, errors: [] });
  });

  it('devuelve los errores por campo de un 207', async () => {
    const fetchImpl = vi.fn(async () => json(207, [{ id: null, sequence: 1, errors: [{ object: 'client', field: 'mainActivity', rejectedValue: '', message: 'requerido' }] }]));
    const r = await new NuboxProvider({ ...cfg, fetchImpl: fetchImpl as any }).issue(factura(), 'k');
    expect(r.ok).toBe(false);
    expect(r.status).toBe('rejected');
    expect(r.errors).toEqual([{ field: 'client.mainActivity', message: 'requerido', rejectedValue: '' }]);
  });

  it('un 400 es un error de la solicitud entera', async () => {
    const fetchImpl = vi.fn(async () => json(400, { status: 400, code: 'BAD_REQUEST', message: 'Api key inválida', errors: [] }));
    const r = await new NuboxProvider({ ...cfg, fetchImpl: fetchImpl as any }).issue(factura(), 'k');
    expect(r).toMatchObject({ ok: false, status: 'error', errors: [{ field: 'documento', message: 'Api key inválida' }] });
  });

  it('normaliza el estado y el folio al consultar', async () => {
    const fetchImpl = vi.fn(async () => json(200, { id: 9911, status: 'Aceptado', folio: 1201 }));
    const r = await new NuboxProvider({ ...cfg, fetchImpl: fetchImpl as any }).getStatus('9911');
    expect(r).toMatchObject({ status: 'accepted', folio: '1201' });
    expect(normalizeStatus('En espera')).toBe('pending');
    expect(normalizeStatus('RECHAZADO')).toBe('rejected');
  });
});

describe('configuración', () => {
  it('apagada por defecto', () => {
    expect(dteConfigStatus({} as any)).toEqual({ provider: null, enabled: false, missing: [], environment: null });
    expect(getDteProvider({} as any)).toBeNull();
  });

  it('encendida sin credenciales no emite y dice cuáles faltan', () => {
    const st = dteConfigStatus({ DTE_PROVIDER: 'nubox', NUBOX_BASE_URL: 'https://api-cert.nubox.example' } as any);
    expect(st).toEqual({ provider: 'nubox', enabled: true, missing: ['NUBOX_SECRET_KEY', 'NUBOX_API_KEY'], environment: 'certificacion' });
    expect(getDteProvider({ DTE_PROVIDER: 'nubox' } as any)).toBeNull();
  });

  it('completa, entrega el proveedor', () => {
    const p = getDteProvider({ DTE_PROVIDER: 'nubox', NUBOX_BASE_URL: 'https://api.nubox.example', NUBOX_SECRET_KEY: 's', NUBOX_API_KEY: 'a' } as any);
    expect(p?.name).toBe('nubox');
  });
});
