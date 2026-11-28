/**
 * El candado de wamid del webhook: una reentrega no vuelve a procesar nada.
 *
 * La base se reemplaza por un Set en memoria que se comporta como la llave
 * primaria de `whatsapp_inbound_claims`: el segundo INSERT del mismo
 * (channel, wamid) devuelve 23505.
 */
import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const SECRET = 'secreto-de-prueba';
const claims = new Set<string>();
let claimError: { code: string; message: string } | null = null;

const processMessage = vi.fn();

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (task: () => unknown) => void task(),
}));

vi.mock('@/lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/integrations/supabase/server', () => ({
  supabaseAdmin: {
    from: () => ({
      insert: ({ channel, wamid }: { channel: string; wamid: string }) => {
        if (claimError) return Promise.resolve({ error: claimError });
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

vi.mock('@/lib/whatsapp-ingest', async () => {
  const { z } = await import('zod');
  return {
    InboundMessageSchema: z.object({
      from: z.string(),
      body: z.string(),
      message_id: z.string().optional(),
    }).passthrough(),
    processMessage: (...a: unknown[]) => processMessage(...a),
    redactPhone: () => '***0000',
  };
});

const { POST } = await import('@/app/api/whatsapp/webhook/route');

function metaEnvelope(messages: { id?: string; body: string }[]) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          messages: messages.map((m) => ({
            from: '56912345678',
            ...(m.id ? { id: m.id } : {}),
            type: 'text',
            text: { body: m.body },
          })),
        },
      }],
    }],
  };
}

function request(payload: unknown): NextRequest {
  const body = JSON.stringify(payload);
  const meta = process.env.WHATSAPP_PROVIDER === 'meta';
  const signature = meta
    ? `sha256=${crypto.createHmac('sha256', SECRET).update(body).digest('hex')}`
    : crypto.createHmac('sha256', SECRET).update(body).digest('base64');
  return new NextRequest('http://localhost/api/whatsapp/webhook', {
    method: 'POST',
    body,
    headers: { 'x-hub-signature-256': signature },
  });
}

beforeEach(() => {
  claims.clear();
  claimError = null;
  processMessage.mockReset();
  processMessage.mockResolvedValue({ status: 200, payload: { status: 'ok' } });
  process.env.WHATSAPP_AUTH_TOKEN = SECRET;
  process.env.WHATSAPP_PROVIDER = 'meta';
});

describe('webhook de WhatsApp — candado de wamid', () => {
  it('la reentrega de un wamid responde 200 y no procesa nada', async () => {
    const envelope = metaEnvelope([{ id: 'wamid.A', body: 'pauta 1A2B3C4D listo' }]);

    const first = await POST(request(envelope));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ status: 'ok' });

    const second = await POST(request(envelope));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ status: 'duplicate', message_id: 'wamid.A' });

    expect(processMessage).toHaveBeenCalledTimes(1);
  });

  it('dos entregas simultáneas del mismo wamid: sólo una procesa', async () => {
    const envelope = metaEnvelope([{ id: 'wamid.B', body: 'fin 40879' }]);
    await Promise.all([POST(request(envelope)), POST(request(envelope))]);
    expect(processMessage).toHaveBeenCalledTimes(1);
  });

  it('un mensaje de Meta sin wamid no se procesa', async () => {
    const res = await POST(request(metaEnvelope([{ body: 'fin 40879' }])));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ignored', reason: 'Mensaje sin wamid' });
    expect(processMessage).not.toHaveBeenCalled();
  });

  it('si el procesamiento lanza, responde 500 y suelta el candado para el reintento', async () => {
    const envelope = metaEnvelope([{ id: 'wamid.C', body: 'fin 40879' }]);
    processMessage.mockRejectedValueOnce(new Error('base caída'));

    expect((await POST(request(envelope))).status).toBe(500);
    expect(claims.size).toBe(0);

    const retry = await POST(request(envelope));
    expect(await retry.json()).toEqual({ status: 'ok' });
    expect(processMessage).toHaveBeenCalledTimes(2);
  });

  it('en un sobre reintentado, lo ya procesado se salta y lo que falló vuelve a entrar', async () => {
    const envelope = metaEnvelope([
      { id: 'wamid.D1', body: 'fin 40879' },
      { id: 'wamid.D2', body: 'inicio 40965' },
    ]);
    processMessage
      .mockResolvedValueOnce({ status: 200, payload: { status: 'ok' } })
      .mockRejectedValueOnce(new Error('timeout'));

    expect((await POST(request(envelope))).status).toBe(500);

    const retry = await POST(request(envelope));
    expect(await retry.json()).toEqual({
      status: 'batch',
      results: [{ status: 'duplicate', message_id: 'wamid.D1' }, { status: 'ok' }],
    });
    expect(processMessage).toHaveBeenCalledTimes(3);
  });

  it('un 429 suelta el candado; un 400 no', async () => {
    process.env.WHATSAPP_PROVIDER = 'generic';

    processMessage.mockResolvedValueOnce({ status: 429, payload: { error: 'Rate limit exceeded' } });
    await POST(request({ from: '+56912345678', body: 'fin 1', message_id: 'gen.1' }));
    expect(claims.has('production:gen.1')).toBe(false);

    processMessage.mockResolvedValueOnce({ status: 400, payload: { error: 'Formato de OT inválido' } });
    await POST(request({ from: '+56912345678', body: 'fin x', message_id: 'gen.2' }));
    expect(claims.has('production:gen.2')).toBe(true);
  });

  it('si el candado no se puede tomar, falla cerrado: 500 y nada se procesa', async () => {
    claimError = { code: '42P01', message: 'relation does not exist' };
    const res = await POST(request(metaEnvelope([{ id: 'wamid.E', body: 'fin 40879' }])));
    expect(res.status).toBe(500);
    expect(processMessage).not.toHaveBeenCalled();
  });

  it('el proveedor genérico sin message_id se procesa como antes, sin candado', async () => {
    process.env.WHATSAPP_PROVIDER = 'generic';
    const payload = { from: '+56912345678', body: 'fin 40879' };
    await POST(request(payload));
    await POST(request(payload));
    expect(processMessage).toHaveBeenCalledTimes(2);
    expect(claims.size).toBe(0);
  });
});
