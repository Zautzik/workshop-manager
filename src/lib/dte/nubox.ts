import type {
  DteDocument, DteFieldError, DteIssueResult, DteProvider, DteStatus, DteStatusResult,
} from './types';
import { DTE_TYPES } from './types';
import { normalizeRut } from './validate';

/**
 * Adaptador Nubox — API "Factura y Administración" (la nueva, /v1).
 *
 * Fuente: documentación oficial https://developers.nubox.com/api-docs,
 * leída el 2026-11-25. Se eligió la API nueva y no la heredada
 * (api.nubox.com/Nubox.API…/emitir/ventaExtendido) porque es REST con
 * idempotencia por cabecera, acepta lotes de hasta 50 documentos y separa
 * emitir de consultar el estado, que es como el SII trabaja de verdad.
 *
 * ── Cómo se conecta (resumen; el detalle está en docs/nubox-integracion.md) ──
 *
 *   NUBOX_BASE_URL     URL base que entrega soporte de Nubox. Primero la de
 *                      certificación (UAT), después la de producción.
 *   NUBOX_SECRET_KEY   "Secret Key única asociada al partner" → Authorization
 *   NUBOX_API_KEY      "Api Key única asociada a una compañía autorizada para
 *                      el partner" → X-Api-Key
 *   DTE_PROVIDER=nubox enciende la emisión. Sin esto, nada sale.
 *
 * ── Lo que la documentación no dice, y se confirma en UAT ───────────────────
 *
 * Cada punto está marcado `VERIFICAR EN UAT` donde se usa:
 *   1. El esquema de la respuesta de GET /v1/sales/{id}: la documentación sólo
 *      nombra los estados en prosa ("aceptado, rechazado o en espera"). Se
 *      leen varias formas posibles y se normalizan en `normalizeStatus`.
 *   2. Si `Authorization` lleva la Secret Key sola o con prefijo "Bearer".
 *   3. El formato del RUT en `client.identification.value` (se envía sin
 *      puntos y con guion: 76543210-3).
 *   4. Si el IVA se calcula sólo con `subjectToTax` (así lo dice la API
 *      heredada) o hay que mandar `taxes[]` con legalCode "14".
 */

const SALE_TYPE_NORMAL = 1; // "Tipo de venta (1 = Venta normal)"
const IDENT_RUT = 1; // "1 = RUT chileno"

export interface NuboxConfig {
  baseUrl: string;
  secretKey: string;
  apiKey: string;
  /** Inyectable para tests. */
  fetchImpl?: typeof fetch;
}

/** Una fecha YYYY-MM-DD → el ISO con zona que pide `documentEmissionDate`. */
function isoWithZone(date: string): string {
  // Mediodía en Chile continental: ningún cambio de horario corre el día.
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00.000-04:00` : date;
}

/** Documento neutro → un elemento del arreglo de POST /v1/sales/issuance. */
export function toNuboxSale(doc: DteDocument, sequence: number): Record<string, unknown> {
  const r = doc.receptor;
  const sale: Record<string, unknown> = {
    sequence,
    type: { legalCode: String(doc.type) },
    client: {
      tradeName: r.razonSocial.slice(0, 100),
      identification: { type: IDENT_RUT, value: normalizeRut(r.rut) ?? r.rut }, // VERIFICAR EN UAT (3)
      mainActivity: (r.giro ?? '').slice(0, 40),
      ...(r.email ? { email: r.email.slice(0, 100) } : {}),
      ...(r.contacto ? { contactName: r.contacto.slice(0, 100) } : {}),
      ...(r.telefono ? { phone: r.telefono.slice(0, 30) } : {}),
      ...(r.direccion ? { address: r.direccion.slice(0, 200) } : {}),
      ...(r.ciudad ? { city: r.ciudad.slice(0, 50) } : {}),
      territorialDivisionLegalCode: r.regionCode,
      territorialDivisionL2LegalCode: r.comunaCode,
    },
    saleType: { id: SALE_TYPE_NORMAL },
    paymentForm: { id: doc.paymentForm },
    details: doc.lines.map((l, i) => ({
      order: i + 1,
      ...(l.productCode ? { productCode: l.productCode.replace(/[^A-Za-z0-9\-_.#@[\](){}]/g, '').slice(0, 35) } : {}),
      quantity: l.quantity,
      productDescription: l.description.slice(0, 80),
      ...(l.descriptionExtended ? { productDescriptionExtended: l.descriptionExtended.slice(0, 1000) } : {}),
      subjectToTax: l.afecto, // VERIFICAR EN UAT (4)
      uom: { code: l.uom.slice(0, 4) },
      price: l.unitPrice,
    })),
  };

  if (doc.dueDate) sale.dueDate = doc.dueDate;
  if (doc.comment) sale.comment = doc.comment.slice(0, 500);

  if (doc.references?.length) {
    sale.references = doc.references.map((ref) => ({
      legalCode: String(ref.type),
      documentNumber: String(ref.folio),
      documentEmissionDate: isoWithZone(ref.date),
      ...(ref.totalAmount != null ? { documentTotalAmount: ref.totalAmount } : {}),
      ...(ref.motive != null ? { motiveTypeId: ref.motive } : {}),
      ...(ref.motiveDescription ? { motiveDescription: ref.motiveDescription.slice(0, 90) } : {}),
    }));
  }

  if (doc.type === DTE_TYPES.GUIA_DESPACHO && doc.dispatch) {
    const d = doc.dispatch;
    sale.dispatchGuideDetail = {
      driver: {
        ...(d.choferNombre ? { name: d.choferNombre.slice(0, 30) } : {}),
        identification: { type: IDENT_RUT, value: normalizeRut(d.choferRut) ?? d.choferRut },
      },
      conveyor: { identification: { type: IDENT_RUT, value: normalizeRut(d.transportistaRut) ?? d.transportistaRut } },
      ...(d.patente ? { licensePlate: d.patente.slice(0, 8) } : {}),
      destination: {
        ...(d.destinoDireccion ? { address: d.destinoDireccion.slice(0, 70) } : {}),
        ...(d.destinoCiudad ? { city: d.destinoCiudad.slice(0, 20) } : {}),
        territorialDivisionL2LegalCode: d.destinoComunaCode,
      },
      transferType: { id: d.indicadorTraslado },
    };
  }
  return sale;
}

/** "aceptado" / "ACCEPTED" / "en espera"… → el estado neutro. VERIFICAR EN UAT (1). */
export function normalizeStatus(value: unknown): DteStatus {
  const s = String(value ?? '').toLowerCase();
  if (!s) return 'pending';
  if (/(acept|accept|approved|aprob)/.test(s)) return 'accepted';
  if (/(rechaz|reject|denied)/.test(s)) return 'rejected';
  if (/(espera|pend|process|wait|sent|envi)/.test(s)) return 'pending';
  if (/(error|fail)/.test(s)) return 'error';
  return 'pending';
}

function toErrors(list: unknown): DteFieldError[] {
  if (!Array.isArray(list)) return [];
  return list.map((x: any) => ({
    field: [x?.object, x?.field].filter(Boolean).join('.') || 'documento',
    message: String(x?.message ?? 'Error sin descripción'),
    rejectedValue: x?.rejectedValue,
  }));
}

export class NuboxProvider implements DteProvider {
  readonly name = 'nubox';
  private readonly f: typeof fetch;

  constructor(private readonly cfg: NuboxConfig) {
    this.f = cfg.fetchImpl ?? fetch;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: this.cfg.secretKey, // VERIFICAR EN UAT (2): ¿"Bearer " + key?
      'X-Api-Key': this.cfg.apiKey,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  private url(path: string): string {
    return `${this.cfg.baseUrl.replace(/\/+$/, '')}${path}`;
  }

  async issue(doc: DteDocument, idempotencyKey: string): Promise<DteIssueResult> {
    const res = await this.f(this.url('/v1/sales/issuance'), {
      method: 'POST',
      headers: this.headers({ 'X-Idempotence-id': idempotencyKey }),
      body: JSON.stringify([toNuboxSale(doc, 1)]),
    });
    const raw = await res.json().catch(() => null);

    // 400: el lote completo se rechazó (forma, cabeceras).
    if (res.status === 400 || !res.ok) {
      return {
        ok: false, providerId: null, status: 'error', folio: null, raw,
        errors: toErrors((raw as any)?.errors).concat(
          (raw as any)?.message ? [{ field: 'documento', message: String((raw as any).message) }] : [],
        ),
      };
    }

    // 200 / 207: un resultado por documento. Que no traiga errores NO es que
    // el SII lo aceptó — la documentación lo dice: "No consideres esta
    // respuesta como una respuesta de emisión". Queda en `pending` hasta que
    // getStatus diga otra cosa.
    const item = Array.isArray(raw) ? (raw as any[]).find((x) => x?.sequence === 1) ?? raw[0] : raw;
    const errors = toErrors(item?.errors);
    return {
      ok: errors.length === 0,
      providerId: item?.id != null ? String(item.id) : null,
      status: errors.length ? 'rejected' : 'pending',
      folio: null,
      errors,
      raw,
    };
  }

  async getStatus(providerId: string): Promise<DteStatusResult> {
    const res = await this.f(this.url(`/v1/sales/${encodeURIComponent(providerId)}`), { headers: this.headers() });
    const raw: any = await res.json().catch(() => null);
    if (!res.ok) {
      return { status: 'error', folio: null, raw, errors: [{ field: 'documento', message: raw?.message ?? `Nubox respondió ${res.status}` }] };
    }
    // VERIFICAR EN UAT (1): nombres reales de los campos de estado y folio.
    const statusValue = raw?.status ?? raw?.state ?? raw?.documentStatus ?? raw?.siiStatus ?? raw?.legalStatus?.name;
    const folio = raw?.folio ?? raw?.number ?? raw?.documentNumber ?? raw?.legalNumber ?? null;
    return { status: normalizeStatus(statusValue), folio: folio != null ? String(folio) : null, errors: toErrors(raw?.errors), raw };
  }

  async getPdf(providerId: string): Promise<{ contentType: string; body: ArrayBuffer }> {
    const res = await this.f(this.url(`/v1/sales/${encodeURIComponent(providerId)}/pdf?template=TEMPLATE_A4`), {
      headers: this.headers({ Accept: 'application/pdf' }),
    });
    if (!res.ok) throw new Error(`Nubox no entregó el PDF (${res.status})`);
    return { contentType: res.headers.get('content-type') ?? 'application/pdf', body: await res.arrayBuffer() };
  }
}
