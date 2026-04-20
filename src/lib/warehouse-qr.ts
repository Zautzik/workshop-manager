/* ------------------------------------------------------------------ */
/*  Warehouse QR Code Generator                                        */
/*                                                                     */
/*  Generates QR code data strings for printing labels that warehouse  */
/*  operators can scan with their phone camera and send via WhatsApp.  */
/*                                                                     */
/*  QR Format:  WH:<ACTION>:<item_id>[:<extra>]                       */
/*  Examples:                                                          */
/*    WH:RECV:abc123          → Receive item abc123                    */
/*    WH:USE:abc123:OT-456    → Use item abc123 for OT-456           */
/*    WH:CHK:abc123           → Check stock of item abc123            */
/*    WH:LOT:abc123:lot789    → Specific lot operation                */
/*    WH:ITEM:abc123          → Generic item (action from message)    */
/* ------------------------------------------------------------------ */

import {
  WH_QR_PREFIX,
  type WarehouseActionType,
  type WarehouseQRData,
} from '@/types/whatsapp-warehouse';

/* ─── Action Codes ───────────────────────────────────────────── */
const ACTION_CODES: Record<WarehouseActionType, string> = {
  receive: 'RECV',
  use: 'USE',
  return: 'RET',
  check: 'CHK',
  unknown: 'ITEM',
};

const CODE_TO_ACTION: Record<string, WarehouseActionType> = {
  RECV: 'receive',
  USE: 'use',
  RET: 'return',
  CHK: 'check',
  ITEM: 'unknown',
};

/* ─── Encode QR Value ────────────────────────────────────────── */

/** Generate a QR code string for an inventory item */
export function encodeWarehouseQR(params: {
  itemId: string;
  itemName: string;
  itemSku: string;
  action?: WarehouseActionType;
  otNumber?: string;
  lotId?: string;
}): WarehouseQRData {
  const { itemId, itemName, itemSku, action, otNumber, lotId } = params;

  const actionCode = ACTION_CODES[action ?? 'unknown'];
  const parts = [WH_QR_PREFIX + actionCode, itemId];

  if (lotId) {
    parts.push(lotId);
  } else if (otNumber) {
    parts.push(otNumber);
  }

  const value = parts.join(':');

  // Human-readable label for the printed sticker
  const actionLabel = action
    ? { receive: 'RECEPCIÓN', use: 'USO', return: 'DEVOLUCIÓN', check: 'CONSULTA', unknown: '' }[action]
    : '';
  const label = [actionLabel, itemSku, itemName].filter(Boolean).join(' — ');

  return { value, label, item_id: itemId, item_name: itemName, item_sku: itemSku, action, ot_number: otNumber };
}

/* ─── Decode QR Value ────────────────────────────────────────── */

export interface DecodedQR {
  isWarehouseQR: boolean;
  action: WarehouseActionType;
  itemId: string | null;
  extra: string | null; // OT number or lot ID
}

/** Parse a scanned QR code string */
export function decodeWarehouseQR(raw: string): DecodedQR {
  const trimmed = raw.trim();

  if (!trimmed.startsWith(WH_QR_PREFIX)) {
    return { isWarehouseQR: false, action: 'unknown', itemId: null, extra: null };
  }

  // Format: WH:<ACTION>:<itemId>[:<extra>]
  // After prefix removal: <ACTION>:<itemId>[:<extra>]
  const afterPrefix = trimmed.slice(WH_QR_PREFIX.length);
  const segments = afterPrefix.split(':');

  if (segments.length < 2) {
    return { isWarehouseQR: true, action: 'unknown', itemId: null, extra: null };
  }

  const actionCode = segments[0].toUpperCase();
  const action = CODE_TO_ACTION[actionCode] ?? 'unknown';
  const itemId = segments[1] || null;
  const extra = segments[2] || null;

  return { isWarehouseQR: true, action, itemId, extra };
}

/* ─── Generate Print-Ready QR Data for Batch ─────────────────── */

export interface QRPrintItem {
  qrValue: string;
  label: string;
  sku: string;
  itemName: string;
  action?: string;
}

/**
 * Generate an array of QR print data for a list of inventory items.
 * Used to print sticker sheets with QR codes for warehouse shelves.
 */
export function generatePrintBatch(
  items: Array<{ id: string; sku: string; name: string }>,
  action?: WarehouseActionType,
  otNumber?: string,
): QRPrintItem[] {
  return items.map((item) => {
    const qr = encodeWarehouseQR({
      itemId: item.id,
      itemName: item.name,
      itemSku: item.sku,
      action,
      otNumber,
    });
    return {
      qrValue: qr.value,
      label: qr.label,
      sku: item.sku,
      itemName: item.name,
      action: action ?? undefined,
    };
  });
}
