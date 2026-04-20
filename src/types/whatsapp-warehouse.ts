/* ------------------------------------------------------------------ */
/*  WhatsApp Warehouse Tracking — Domain Types                         */
/*                                                                     */
/*  Warehouse operators scan QR codes (custom-printed) or supplier     */
/*  barcodes via WhatsApp to register:                                 */
/*    RECEIVE:  Incoming supplies (procurement fulfillment)            */
/*    USE:      Material consumption against a work order (OT)         */
/*    RETURN:   Return unused material to stock                        */
/*    CHECK:    Quick stock check for an item                          */
/*                                                                     */
/*  QR Code Format:  WH:<ACTION>:<item_id>[:<ot_number>]              */
/*  Barcode:  Matched against inventory_items.barcode_value            */
/* ------------------------------------------------------------------ */

/* ─── Warehouse Action Types ─────────────────────────────────── */
export type WarehouseActionType =
  | 'receive'      // Incoming purchase / procurement
  | 'use'          // Consumption against OT
  | 'return'       // Return unused material
  | 'check'        // Stock inquiry
  | 'unknown';

/* ─── Review Status ──────────────────────────────────────────── */
export type WarehouseReviewStatus =
  | 'pending'        // Awaiting supervisor review
  | 'approved'       // Approved → stock transaction created
  | 'rejected'       // Rejected with reason
  | 'needs_revision' // Needs correction
  | 'auto_approved'; // Auto-approved (stock checks)

/* ─── QR Code Types ──────────────────────────────────────────── */
export type QRCodeType =
  | 'item'          // Points to an inventory item
  | 'item_action'   // Points to item + pre-set action
  | 'lot'           // Points to a specific lot
  | 'location';     // Points to a warehouse location/shelf

/* ─── Parsed QR/Barcode Result ───────────────────────────────── */
export interface ParsedScanData {
  /** Type of code scanned */
  scan_type: 'qr' | 'barcode' | 'text';
  /** Matched inventory item ID */
  item_id: string | null;
  /** Matched inventory item SKU */
  item_sku: string | null;
  /** Matched inventory item name */
  item_name: string | null;
  /** Lot ID if specified in QR */
  lot_id: string | null;
  /** Lot number if specified */
  lot_number: string | null;
  /** The action inferred from QR or keywords */
  action: WarehouseActionType;
  /** OT number if referenced */
  ot_number: string | null;
  /** Quantity parsed from message text */
  quantity: number | null;
  /** Unit parsed or inherited from item */
  unit: string | null;
  /** Unit cost (for receives) */
  unit_cost: number | null;
  /** Supplier name (for receives) */
  supplier_name: string | null;
  /** Notes / extra text */
  notes: string;
  /** Confidence 0-100 */
  confidence: number;
}

/* ─── Warehouse Transaction Log ──────────────────────────────── */
export interface WhatsAppWarehouseLog {
  id: string;
  /** Action type */
  action_type: WarehouseActionType;
  /** Matched inventory item ID */
  item_id: string | null;
  /** Item name (denormalized for display) */
  item_name: string | null;
  /** Item SKU (denormalized) */
  item_sku: string | null;
  /** Lot ID if applicable */
  lot_id: string | null;
  /** OT number (for use/return actions) */
  ot_number: string | null;
  /** OT id if matched */
  ot_id: string | null;
  /** Operator phone */
  operator_phone: string;
  /** Operator name */
  operator_name: string | null;
  /** Employee ID */
  operator_employee_id: string | null;
  /** Raw scanned value (QR content or barcode) */
  scanned_value: string;
  /** Raw message text */
  raw_message: string;
  /** Message timestamp */
  message_timestamp: string;
  /** Parsed scan data */
  parsed_data: ParsedScanData | null;
  /** Quantity reported */
  quantity: number | null;
  /** Unit */
  unit: string | null;
  /** Unit cost */
  unit_cost: number | null;
  /** Supplier name */
  supplier_name: string | null;
  /** Review status */
  review_status: WarehouseReviewStatus;
  /** Reviewer user ID */
  reviewed_by: string | null;
  /** Review timestamp */
  reviewed_at: string | null;
  /** Review comments */
  review_comments: string | null;
  /** Corrected quantity (supervisor override) */
  corrected_quantity: number | null;
  /** Corrected unit cost (supervisor override) */
  corrected_unit_cost: number | null;
  /** Whether fed into inventory_stock_transactions */
  fed_to_inventory: boolean;
  /** Resulting inventory transaction ID */
  inventory_tx_id: string | null;
  /** Created at */
  created_at: string;
  /** Updated at */
  updated_at: string;
}

/* ─── Dashboard Summary ──────────────────────────────────────── */
export interface WhatsAppWarehouseSummary {
  pending_reviews: number;
  approved_today: number;
  rejected_today: number;
  receives_today: number;
  consumptions_today: number;
  returns_today: number;
  total_today: number;
}

/* ─── QR Code Data (for generation) ──────────────────────────── */
export interface WarehouseQRData {
  /** The encoded string for the QR */
  value: string;
  /** Human-readable label */
  label: string;
  /** Item info */
  item_id: string;
  item_name: string;
  item_sku: string;
  /** Pre-set action (optional) */
  action?: WarehouseActionType;
  /** Pre-set OT (optional) */
  ot_number?: string;
}

/* ─── Constants ──────────────────────────────────────────────── */

/** QR prefix for warehouse operations */
export const WH_QR_PREFIX = 'WH:';

/** Keywords that signal RECEIVE */
export const RECEIVE_KEYWORDS = [
  'recibo', 'recibido', 'recibí', 'recibi', 'recepcion', 'recepción',
  'llegó', 'llego', 'ingreso', 'entrada', 'compra', 'receive',
  'recibimos', 'llegaron', 'ingresaron',
];

/** Keywords that signal USE/CONSUME */
export const USE_KEYWORDS = [
  'uso', 'usé', 'use', 'consumo', 'consumí', 'gasto', 'gasté',
  'saqué', 'saque', 'retiré', 'retire', 'retiro', 'ocupé', 'ocupe',
  'usamos', 'gastamos', 'sacamos', 'retiramos', 'ocupamos',
];

/** Keywords that signal RETURN */
export const RETURN_KEYWORDS = [
  'devuelvo', 'devuelto', 'devolucion', 'devolución', 'retorno',
  'regreso', 'sobró', 'sobro', 'sobrante', 'return',
  'devolvemos', 'regresamos', 'retornamos',
];

/** Keywords that signal CHECK / stock inquiry */
export const CHECK_KEYWORDS = [
  'check', 'stock', 'cuanto', 'cuánto', 'cuantos', 'cuántos',
  'hay', 'queda', 'quedan', 'disponible', 'consulta', 'revisar',
];

/** Common unit keywords */
export const UNIT_KEYWORDS: Record<string, string> = {
  'kg': 'kg',
  'kilo': 'kg',
  'kilos': 'kg',
  'kilogramo': 'kg',
  'kilogramos': 'kg',
  'resma': 'resma',
  'resmas': 'resma',
  'pliego': 'pliego',
  'pliegos': 'pliego',
  'hoja': 'hoja',
  'hojas': 'hoja',
  'litro': 'lt',
  'litros': 'lt',
  'lt': 'lt',
  'lts': 'lt',
  'ml': 'ml',
  'rollo': 'rollo',
  'rollos': 'rollo',
  'caja': 'caja',
  'cajas': 'caja',
  'unidad': 'unit',
  'unidades': 'unit',
  'un': 'unit',
  'ud': 'unit',
  'metro': 'm',
  'metros': 'm',
  'mt': 'm',
  'mts': 'm',
  'galón': 'gal',
  'galon': 'gal',
  'galones': 'gal',
  'botella': 'botella',
  'botellas': 'botella',
  'tarro': 'tarro',
  'tarros': 'tarro',
  'balde': 'balde',
  'baldes': 'balde',
};
