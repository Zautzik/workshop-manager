/**
 * El candado de wamid en el webhook de bodega, y la llave por evento de los
 * mensajes compuestos (H1).
 */
import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const SECRET = 'secreto-de-prueba';
const claims = new Set<string>();
const processWarehousePhoto = vi.fn();

vi.mock('@/lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/integrations/supabase/server', () => ({
  supabaseAdmin: {
    from: () => ({
      insert: ({ channel, wamid }: { channel: string; wamid: string }) => {
        const key = `${channel}:${wamid}`;
        if (claims.has(key)) {
          return Promise.resolve({ error: { code: '23505', message: 'duplicate key' } });
        }
        claims.add(key);
        return Promise.resolve({ error: null });
      },
      delete: () => ({
        eq: (_c: string, channel: string) => ({
          eq: (_w: string, wamid: string) => {
            claims.delete(`${channel}:${wamid}`);
            return Promise.resolve({ error: null });
          },
        }),
      }),
    }),
  },
}));

vi.mock('@/lib/warehouse-photo-ingest', () => ({
  processWarehousePhoto: (...a: unknown[]) => processWarehousePhoto(...a),
}));
vi.mock('@/lib/whatsapp-maintenance-ingest', () => ({
  tryProcessMaintenanceMessage: () => Promise.resolve(null),
}));

const { POST } = await import('@/app/api/whatsapp/warehouse/webhook/route');
const { eventMessageId } = await import('@/lib/whatsapp-ingest');

function photoEnvelope(id?: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          messages: [{
            from: '56912345678',
            ...(id ? { id } : {}),
            type: 'image',
            image: { id: 'media-1', mime_type: 'image/jpeg' },
          }],
        },
      }],
    }],
  };
}

function request(payload: unknown): NextRequest {
  const body = JSON.stringify(payload);
  return new NextRequest('http://localhost/api/whatsapp/warehouse/webhook', {
    method: 'POST',
    body,
    headers: {
      'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', SECRET).update(body).digest('hex')}`,
    },
  });
}

beforeEach(() => {
  claims.clear();
  processWarehousePhoto.mockReset();
  processWarehousePhoto.mockResolvedValue({ status: 200, payload: { status: 'ok' } });
  process.env.WHATSAPP_AUTH_TOKEN = SECRET;
  process.env.WHATSAPP_PROVIDER = 'meta';
});

describe('webhook de bodega — candado de wamid', () => {
  it('la foto reentregada no se vuelve a procesar', async () => {
    const first = await POST(request(photoEnvelope('wamid.F')));
    expect(await first.json()).toEqual({ status: 'ok' });

    const second = await POST(request(photoEnvelope('wamid.F')));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ status: 'duplicate', message_id: 'wamid.F' });

    expect(processWarehousePhoto).toHaveBeenCalledTimes(1);
    expect(claims.has('warehouse:wamid.F')).toBe(true);
  });

  it('un 429 suelta el candado para que el reintento entre', async () => {
    processWarehousePhoto.mockResolvedValueOnce({ status: 429, payload: { status: 'error' } });
    await POST(request(photoEnvelope('wamid.G')));
    expect(claims.size).toBe(0);

    await POST(request(photoEnvelope('wamid.G')));
    expect(processWarehousePhoto).toHaveBeenCalledTimes(2);
  });

  it('sin wamid no se procesa', async () => {
    const res = await POST(request(photoEnvelope()));
    expect(await res.json()).toEqual({ status: 'ignored', reason: 'Mensaje sin wamid' });
    expect(processWarehousePhoto).not.toHaveBeenCalled();
  });
});

describe('eventMessageId — la llave de cada evento de un mensaje', () => {
  it('un mensaje de un solo evento conserva el wamid', () => {
    expect(eventMessageId('wamid.X', 0, 1)).toBe('wamid.X');
  });

  it('un mensaje compuesto da una llave distinta y estable por evento', () => {
    const fin = eventMessageId('wamid.X', 0, 2);
    const inicio = eventMessageId('wamid.X', 1, 2);
    expect(fin).not.toBe(inicio);
    expect(eventMessageId('wamid.X', 1, 2)).toBe(inicio);
  });

  it('sin wamid no hay llave', () => {
    expect(eventMessageId(null, 1, 2)).toBeNull();
  });
});
