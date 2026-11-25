/**
 * Documento Tributario Electrónico (DTE), independiente del proveedor.
 *
 * La aplicación arma UN documento con esta forma y un adaptador (hoy Nubox,
 * src/lib/dte/nubox.ts) lo traduce a la API de su proveedor. Así cambiar de
 * proveedor —o sumar uno— no toca las rutas ni las pantallas.
 *
 * Los códigos son los del SII, no los de un proveedor.
 */

/** Códigos SII de tipo de documento que la imprenta emite o puede emitir. */
export const DTE_TYPES = {
  FACTURA: 33,
  FACTURA_EXENTA: 34,
  GUIA_DESPACHO: 52,
  NOTA_DEBITO: 56,
  NOTA_CREDITO: 61,
} as const;
export type DteType = (typeof DTE_TYPES)[keyof typeof DTE_TYPES];

export const DTE_TYPE_LABEL: Record<DteType, string> = {
  33: 'Factura electrónica',
  34: 'Factura exenta electrónica',
  52: 'Guía de despacho electrónica',
  56: 'Nota de débito electrónica',
  61: 'Nota de crédito electrónica',
};

/** El receptor, tal como lo exige el SII (y por lo tanto cualquier proveedor). */
export interface DteReceptor {
  rut: string;
  razonSocial: string;
  /** Giro / actividad principal. Obligatorio para factura. Máx. 40. */
  giro: string | null;
  email?: string | null;
  contacto?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  /** Código de región (ej. "13" Metropolitana). */
  regionCode: string | null;
  /** Código de comuna de 5 dígitos (ej. "13101" Santiago). */
  comunaCode: string | null;
}

export interface DteLine {
  /** Código interno (ej. número de OT). Opcional. */
  productCode?: string | null;
  description: string;
  descriptionExtended?: string | null;
  quantity: number;
  /** Precio unitario NETO en pesos. Puede tener decimales. */
  unitPrice: number;
  /** Unidad de medida, máx. 4 caracteres ("UNID", "KG", "MIL"). */
  uom: string;
  /** Afecto a IVA. */
  afecto: boolean;
}

export interface DteReference {
  /** Tipo SII del documento referenciado (ej. 52 una guía, 33 una factura). */
  type: DteType | number;
  folio: string;
  /** Fecha de emisión del referenciado, ISO (YYYY-MM-DD o con hora). */
  date: string;
  /** Requerido para notas de crédito / débito. */
  totalAmount?: number;
  /** 1 anula, 2 corrige texto, 3 corrige monto (notas). */
  motive?: 1 | 2 | 3;
  motiveDescription?: string;
}

export interface DteDispatch {
  /** RUT de quien transporta (empresa o persona). */
  transportistaRut: string | null;
  choferRut: string | null;
  choferNombre?: string | null;
  patente?: string | null;
  destinoDireccion?: string | null;
  destinoCiudad?: string | null;
  destinoComunaCode: string | null;
  /**
   * Indicador de traslado SII: 1 operación constituye venta, 2 ventas por
   * efectuar, 3 consignaciones, 4 entrega gratuita, 5 traslados internos,
   * 6 otros traslados no venta, 7 guía de devolución.
   */
  indicadorTraslado: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

export interface DteDocument {
  type: DteType;
  receptor: DteReceptor;
  lines: DteLine[];
  references?: DteReference[];
  /** YYYY-MM-DD. */
  dueDate?: string | null;
  /** 1 contado, 2 crédito. */
  paymentForm: 1 | 2;
  comment?: string | null;
  dispatch?: DteDispatch | null;
}

/** Estado de un DTE en el ciclo del SII, normalizado entre proveedores. */
export type DteStatus = 'not_sent' | 'pending' | 'accepted' | 'rejected' | 'error';

export interface DteFieldError {
  field: string;
  message: string;
  rejectedValue?: unknown;
}

export interface DteIssueResult {
  ok: boolean;
  /** Identificador del documento en el proveedor (para consultar el estado). */
  providerId: string | null;
  status: DteStatus;
  folio: string | null;
  errors: DteFieldError[];
  /** Respuesta cruda, para auditoría. Nunca se muestra tal cual. */
  raw?: unknown;
}

export interface DteStatusResult {
  status: DteStatus;
  folio: string | null;
  errors: DteFieldError[];
  raw?: unknown;
}

/** El contrato que cumple cada proveedor. */
export interface DteProvider {
  readonly name: string;
  /**
   * Emite un documento. `idempotencyKey` se guarda en la base ANTES de llamar:
   * reintentar con la misma llave nunca emite dos veces.
   */
  issue(doc: DteDocument, idempotencyKey: string): Promise<DteIssueResult>;
  getStatus(providerId: string): Promise<DteStatusResult>;
  getPdf(providerId: string): Promise<{ contentType: string; body: ArrayBuffer }>;
}
