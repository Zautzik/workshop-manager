/* ------------------------------------------------------------------ */
/*  WhatsApp Warehouse Message Parser                                  */
/*                                                                     */
/*  Parses incoming WhatsApp messages from warehouse operators.        */
/*  Messages can contain:                                              */
/*    1. A custom QR code value (WH:RECV:item_id, etc.)               */
/*    2. A supplier barcode (matched against inventory_items)          */
/*    3. Free-text with action keywords + quantities                   */
/*    4. Combinations: QR scan + text ("WH:RECV:abc123 10 resmas")    */
/*                                                                     */
/*  This module only does text parsing — DB lookups happen in the      */
/*  webhook handler.                                                   */
/* ------------------------------------------------------------------ */

import {
  type WarehouseActionType,
  type ParsedScanData,
  RECEIVE_KEYWORDS,
  USE_KEYWORDS,
  RETURN_KEYWORDS,
  CHECK_KEYWORDS,
  UNIT_KEYWORDS,
  WH_QR_PREFIX,
} from '@/types/whatsapp-warehouse';
import { decodeWarehouseQR } from '@/lib/warehouse-qr';

/* ─── Chilean Number Parsing ─────────────────────────────────── */

function parseChileanNumber(raw: string): number | null {
  // "1.500" → 1500 (Chilean uses . as thousands separator)
  // "1,5" → 1.5 (Chilean uses , as decimal separator)
  const cleaned = raw.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/* ─── Text Normalizer ────────────────────────────────────────── */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .trim();
}

/* ─── Action Classification ──────────────────────────────────── */

function classifyAction(text: string): { action: WarehouseActionType; confidence: number } {
  const norm = normalize(text);
  const words = norm.split(/\s+/);

  let action: WarehouseActionType = 'unknown';
  let confidence = 0;

  // Check keywords in priority order
  const checks: Array<{ keywords: string[]; act: WarehouseActionType }> = [
    { keywords: RECEIVE_KEYWORDS, act: 'receive' },
    { keywords: USE_KEYWORDS, act: 'use' },
    { keywords: RETURN_KEYWORDS, act: 'return' },
    { keywords: CHECK_KEYWORDS, act: 'check' },
  ];

  for (const { keywords, act } of checks) {
    const normalizedKeywords = keywords.map((k) => normalize(k));
    const found = words.some((w) => normalizedKeywords.includes(w));
    if (found) {
      action = act;
      confidence = 70;
      break;
    }
  }

  return { action, confidence };
}

/* ─── Quantity + Unit Extraction ──────────────────────────────── */

interface QuantityMatch {
  quantity: number;
  unit: string | null;
}

function extractQuantity(text: string): QuantityMatch | null {
  const norm = normalize(text);

  // Pattern: number followed by optional unit
  // Matches: "10 resmas", "1.500 pliegos", "5kg", "2,5 litros"
  const patterns = [
    // "10 resmas", "1.500 pliegos"
    /(\d[\d.,]*)\s*(kg|kilo|kilos|kilogramo|kilogramos|resma|resmas|pliego|pliegos|hoja|hojas|litro|litros|lt|lts|ml|rollo|rollos|caja|cajas|unidad|unidades|un|ud|metro|metros|mt|mts|galon|galones|botella|botellas|tarro|tarros|balde|baldes)\b/,
    // "10 un", bare number at end
    /(\d[\d.,]*)\s*$/,
    // bare number at start
    /^(\d[\d.,]*)\b/,
  ];

  for (const pattern of patterns) {
    const match = norm.match(pattern);
    if (match) {
      const qty = parseChileanNumber(match[1]);
      if (qty !== null && qty > 0) {
        const rawUnit = match[2] || null;
        const unit = rawUnit ? (UNIT_KEYWORDS[rawUnit] ?? rawUnit) : null;
        return { quantity: qty, unit };
      }
    }
  }

  return null;
}

/* ─── Unit Cost Extraction ───────────────────────────────────── */

function extractUnitCost(text: string): number | null {
  const norm = normalize(text);
  // Patterns: "$1500", "1500 pesos", "costo 1500", "precio 1.500"
  const patterns = [
    /\$\s*(\d[\d.,]*)/,
    /(\d[\d.,]*)\s*(?:pesos|clp|peso)/,
    /(?:costo|precio|valor|c\/u)\s*:?\s*(\d[\d.,]*)/,
  ];

  for (const pattern of patterns) {
    const match = norm.match(pattern);
    if (match) {
      return parseChileanNumber(match[1]);
    }
  }

  return null;
}

/* ─── Supplier Name Extraction ───────────────────────────────── */

function extractSupplier(text: string): string | null {
  const norm = normalize(text);
  // "proveedor: xxx", "de xxx", "supplier: xxx"
  const patterns = [
    /(?:proveedor|supplier|de parte de)\s*:?\s*([a-z\s]+?)(?:\d|$|,|\.)/,
  ];

  for (const pattern of patterns) {
    const match = norm.match(pattern);
    if (match && match[1].trim().length > 2) {
      return match[1].trim();
    }
  }

  return null;
}

/* ─── OT Number Extraction ───────────────────────────────────── */

function extractOTNumber(text: string): string | null {
  const norm = normalize(text);
  // "OT-1234", "ot 1234", "OT1234", "orden 1234"
  const patterns = [
    /ot[\s-]*(\d{1,6})/,
    /orden[\s-]*(\d{1,6})/,
  ];

  for (const pattern of patterns) {
    const match = norm.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/* ─── QR / Barcode Detection ─────────────────────────────────── */

interface ScanDetection {
  type: 'qr' | 'barcode' | 'text';
  qrItemId: string | null;
  qrAction: WarehouseActionType;
  qrExtra: string | null;
  /** For barcode: the raw barcode value to look up in DB */
  barcodeValue: string | null;
  /** Remaining text after removing the scan data */
  remainingText: string;
}

function detectScan(rawMessage: string): ScanDetection {
  const trimmed = rawMessage.trim();

  // 1. Check for our custom QR code format
  // The QR value might be the entire message or just part of it
  const qrMatch = trimmed.match(/(WH:[A-Z]+:[^\s]+)/i);

  if (qrMatch) {
    const decoded = decodeWarehouseQR(qrMatch[1]);
    if (decoded.isWarehouseQR) {
      const remaining = trimmed.replace(qrMatch[0], '').trim();
      return {
        type: 'qr',
        qrItemId: decoded.itemId,
        qrAction: decoded.action,
        qrExtra: decoded.extra,
        barcodeValue: null,
        remainingText: remaining,
      };
    }
  }

  // 2. Check for barcode patterns (EAN-13, EAN-8, UPC-A, Code128, etc.)
  // Barcodes are typically pure numeric or alphanumeric strings of 8-20 chars
  // They might be first line if operator scans then types
  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 1) {
    const firstLine = lines[0];
    // EAN-13: 13 digits, EAN-8: 8 digits, UPC-A: 12 digits, Code128: variable
    const barcodePattern = /^[0-9]{8,14}$/;
    if (barcodePattern.test(firstLine)) {
      const remaining = lines.slice(1).join(' ').trim();
      return {
        type: 'barcode',
        qrItemId: null,
        qrAction: 'unknown',
        qrExtra: null,
        barcodeValue: firstLine,
        remainingText: remaining || firstLine, // use barcode as text if nothing else
      };
    }
  }

  // 3. No scan detected; pure text message
  return {
    type: 'text',
    qrItemId: null,
    qrAction: 'unknown',
    qrExtra: null,
    barcodeValue: null,
    remainingText: trimmed,
  };
}

/* ─── Main Parse Function ────────────────────────────────────── */

export interface WarehouseParseResult {
  /** How was the message scanned */
  scan_type: 'qr' | 'barcode' | 'text';
  /** Item ID from QR code (needs DB validation) */
  qr_item_id: string | null;
  /** Barcode value to look up in DB */
  barcode_value: string | null;
  /** Action inferred from QR or text keywords */
  action: WarehouseActionType;
  /** OT number if found */
  ot_number: string | null;
  /** Quantity if found */
  quantity: number | null;
  /** Unit if found */
  unit: string | null;
  /** Unit cost if found */
  unit_cost: number | null;
  /** Supplier name if found */
  supplier_name: string | null;
  /** Remaining unparsed notes */
  notes: string;
  /** Confidence 0-100 */
  confidence: number;
}

/**
 * Parse a WhatsApp message from a warehouse operator.
 * This handles QR codes, barcodes, and free-text messages.
 * 
 * Examples:
 *   "WH:RECV:abc123 10 resmas"
 *   "7891234567890\n5 kg tinta negra"
 *   "recibo 10 resmas papel couche OT-456"
 *   "uso 5 kg tinta ot 1234"
 */
export function parseWarehouseMessage(rawMessage: string): WarehouseParseResult {
  // Step 1: Detect QR/barcode vs text
  const scan = detectScan(rawMessage);

  // Step 2: Extract data from remaining text
  const text = scan.remainingText;
  const { action: textAction, confidence: textConfidence } = classifyAction(text);
  const qtyMatch = extractQuantity(text);
  const unitCost = extractUnitCost(text);
  const supplier = extractSupplier(text);
  const otNumber = extractOTNumber(text) ?? scan.qrExtra ?? null;

  // Determine final action (QR takes precedence)
  let action: WarehouseActionType;
  let confidence: number;

  if (scan.type === 'qr' && scan.qrAction !== 'unknown') {
    action = scan.qrAction;
    confidence = 90; // High confidence from structured QR
  } else if (textAction !== 'unknown') {
    action = textAction;
    confidence = textConfidence;
  } else {
    action = 'unknown';
    confidence = 20;
  }

  // Boost confidence based on available data
  if (scan.type === 'qr' && scan.qrItemId) confidence = Math.min(100, confidence + 5);
  if (scan.type === 'barcode' && scan.barcodeValue) confidence = Math.min(100, confidence + 5);
  if (qtyMatch) confidence = Math.min(100, confidence + 10);
  if (otNumber && action === 'use') confidence = Math.min(100, confidence + 5);
  if (unitCost && action === 'receive') confidence = Math.min(100, confidence + 5);

  // Build notes from unparsed portions
  let notes = text;
  // Strip extracted values from notes
  if (qtyMatch) {
    notes = notes.replace(/\d[\d.,]*\s*(?:kg|kilo|kilos|resma|resmas|pliego|pliegos|hoja|hojas|litro|litros|lt|lts|ml|rollo|rollos|caja|cajas|unidad|unidades|un|ud|metro|metros|mt|mts|galon|galones|botella|botellas|tarro|tarros|balde|baldes)?/i, '').trim();
  }

  return {
    scan_type: scan.type,
    qr_item_id: scan.qrItemId,
    barcode_value: scan.barcodeValue,
    action,
    ot_number: otNumber,
    quantity: qtyMatch?.quantity ?? null,
    unit: qtyMatch?.unit ?? null,
    unit_cost: unitCost,
    supplier_name: supplier,
    notes,
    confidence,
  };
}

/**
 * Check if a message is a warehouse-related message (vs production tracking).
 * Used by the main webhook router to decide which parser to use.
 */
export function isWarehouseMessage(rawMessage: string): boolean {
  const trimmed = rawMessage.trim();

  // Definite warehouse QR
  if (trimmed.includes(WH_QR_PREFIX)) return true;

  // Barcode on first line
  const firstLine = trimmed.split('\n')[0].trim();
  if (/^[0-9]{8,14}$/.test(firstLine)) return true;

  // Warehouse keywords
  const norm = normalize(trimmed);
  const allWarehouseKeywords = [
    ...RECEIVE_KEYWORDS,
    ...USE_KEYWORDS,
    ...RETURN_KEYWORDS,
    ...CHECK_KEYWORDS,
  ].map((k) => normalize(k));

  const words = norm.split(/\s+/);
  return words.some((w) => allWarehouseKeywords.includes(w));
}
