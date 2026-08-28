import { describe, it, expect, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import {
  whatsappProvider,
  verifyWhatsAppSignature,
  extractMetaInbound,
} from '../whatsapp-intake';

const SECRET = 'test-app-secret';

function metaSign(body: string, secret = SECRET): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function genericSign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('whatsappProvider', () => {
  it('defaults to generic when unset', () => {
    vi.stubEnv('WHATSAPP_PROVIDER', '');
    expect(whatsappProvider()).toBe('generic');
  });

  it('returns meta only for the exact value', () => {
    vi.stubEnv('WHATSAPP_PROVIDER', 'meta');
    expect(whatsappProvider()).toBe('meta');
    vi.stubEnv('WHATSAPP_PROVIDER', 'twilio');
    expect(whatsappProvider()).toBe('generic');
  });
});

describe('verifyWhatsAppSignature — meta', () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });

  function headersWith(sig: string | null): Headers {
    const h = new Headers();
    if (sig !== null) h.set('x-hub-signature-256', sig);
    return h;
  }

  it('accepts a valid sha256=<hex> signature', () => {
    vi.stubEnv('WHATSAPP_PROVIDER', 'meta');
    vi.stubEnv('WHATSAPP_AUTH_TOKEN', SECRET);
    expect(verifyWhatsAppSignature(body, headersWith(metaSign(body)))).toBe(true);
  });

  it('accepts uppercase hex digests', () => {
    vi.stubEnv('WHATSAPP_PROVIDER', 'meta');
    vi.stubEnv('WHATSAPP_AUTH_TOKEN', SECRET);
    const sig = metaSign(body).toUpperCase().replace('SHA256=', 'sha256=');
    expect(verifyWhatsAppSignature(body, headersWith(sig))).toBe(true);
  });

  it('rejects a signature computed with the wrong secret', () => {
    vi.stubEnv('WHATSAPP_PROVIDER', 'meta');
    vi.stubEnv('WHATSAPP_AUTH_TOKEN', SECRET);
    expect(
      verifyWhatsAppSignature(body, headersWith(metaSign(body, 'wrong-secret'))),
    ).toBe(false);
  });

  it('rejects a signature over a tampered body', () => {
    vi.stubEnv('WHATSAPP_PROVIDER', 'meta');
    vi.stubEnv('WHATSAPP_AUTH_TOKEN', SECRET);
    expect(
      verifyWhatsAppSignature(body + 'x', headersWith(metaSign(body))),
    ).toBe(false);
  });

  it('rejects when the header is missing or lacks the sha256= prefix', () => {
    vi.stubEnv('WHATSAPP_PROVIDER', 'meta');
    vi.stubEnv('WHATSAPP_AUTH_TOKEN', SECRET);
    expect(verifyWhatsAppSignature(body, headersWith(null))).toBe(false);
    expect(
      verifyWhatsAppSignature(body, headersWith(metaSign(body).slice('sha256='.length))),
    ).toBe(false);
  });

  it('fails closed when WHATSAPP_AUTH_TOKEN is not configured', () => {
    vi.stubEnv('WHATSAPP_PROVIDER', 'meta');
    vi.stubEnv('WHATSAPP_AUTH_TOKEN', '');
    expect(verifyWhatsAppSignature(body, headersWith(metaSign(body)))).toBe(false);
  });

  it('ignores the generic base64 header in meta mode', () => {
    vi.stubEnv('WHATSAPP_PROVIDER', 'meta');
    vi.stubEnv('WHATSAPP_AUTH_TOKEN', SECRET);
    const h = new Headers({ 'x-twilio-signature': genericSign(body) });
    expect(verifyWhatsAppSignature(body, h)).toBe(false);
  });
});

describe('verifyWhatsAppSignature — generic', () => {
  const body = JSON.stringify({ from: '+56912345678', body: 'INICIO OT-1234' });

  it('accepts base64 HMAC in x-twilio-signature', () => {
    vi.stubEnv('WHATSAPP_PROVIDER', '');
    vi.stubEnv('WHATSAPP_AUTH_TOKEN', SECRET);
    const h = new Headers({ 'x-twilio-signature': genericSign(body) });
    expect(verifyWhatsAppSignature(body, h)).toBe(true);
  });

  it('accepts base64 HMAC in x-hub-signature-256 (legacy behavior)', () => {
    vi.stubEnv('WHATSAPP_PROVIDER', '');
    vi.stubEnv('WHATSAPP_AUTH_TOKEN', SECRET);
    const h = new Headers({ 'x-hub-signature-256': genericSign(body) });
    expect(verifyWhatsAppSignature(body, h)).toBe(true);
  });

  it('rejects a Meta-style sha256=<hex> signature in generic mode', () => {
    vi.stubEnv('WHATSAPP_PROVIDER', '');
    vi.stubEnv('WHATSAPP_AUTH_TOKEN', SECRET);
    const h = new Headers({ 'x-hub-signature-256': metaSign(body) });
    expect(verifyWhatsAppSignature(body, h)).toBe(false);
  });

  it('rejects when no signature header is present', () => {
    vi.stubEnv('WHATSAPP_PROVIDER', '');
    vi.stubEnv('WHATSAPP_AUTH_TOKEN', SECRET);
    expect(verifyWhatsAppSignature(body, new Headers())).toBe(false);
  });
});

describe('extractMetaInbound', () => {
  function envelope(value: Record<string, unknown>) {
    return {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123456789',
          changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', ...value } }],
        },
      ],
    };
  }

  it('normalizes a single text message', () => {
    const result = extractMetaInbound(
      envelope({
        contacts: [{ wa_id: '56912345678', profile: { name: 'Juan Pérez' } }],
        messages: [
          {
            from: '56912345678',
            id: 'wamid.ABC',
            timestamp: '1720620000',
            type: 'text',
            text: { body: 'FIN OT-1234 5000 pliegos' },
          },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.messages).toEqual([
      {
        from: '+56912345678',
        body: 'FIN OT-1234 5000 pliegos',
        timestamp: new Date(1720620000 * 1000).toISOString(),
        ProfileName: 'Juan Pérez',
      },
    ]);
    expect(result.ignored).toBe(0);
  });

  it('uses the image caption as the body for media messages', () => {
    const result = extractMetaInbound(
      envelope({
        messages: [
          {
            from: '56912345678',
            type: 'image',
            timestamp: '1720620000',
            image: { id: 'media-1', caption: 'FIN OT-99 2000 pliegos' },
          },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].body).toBe('FIN OT-99 2000 pliegos');
  });

  // Bodega no escribe: la foto de la etiqueta ES el mensaje, y el texto viene
  // adentro, en el código. Descartarla dejaba fuera del sistema al gesto más
  // natural de la gente que está parada al lado del pallet.
  it('deja pasar una foto sin epígrafe, marcada como tal', () => {
    const result = extractMetaInbound(
      envelope({
        messages: [
          { from: '56912345678', type: 'image', image: { id: 'media-1' } },
          { from: '56912345678', type: 'text', text: { body: 'INICIO OT-1' } },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.messages).toHaveLength(2);
    expect(result.ignored).toBe(0);

    const foto = result.messages.find((m) => m.media_only);
    expect(foto?.media_id).toBe('media-1');
    expect(foto?.body).toBe('');
  });

  it('lo que de verdad no dice nada se sigue ignorando', () => {
    // Una reacción o una ubicación no traen ni texto ni imagen que leer.
    const result = extractMetaInbound(
      envelope({
        messages: [{ from: '56912345678', type: 'location' }],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.messages).toHaveLength(0);
    expect(result.ignored).toBe(1);
  });

  it('returns ok with zero messages for status-only webhooks', () => {
    const result = extractMetaInbound(
      envelope({
        statuses: [{ id: 'wamid.ABC', status: 'delivered', recipient_id: '56912345678' }],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.messages).toHaveLength(0);
    expect(result.ignored).toBe(0);
  });

  it('extracts multiple messages from one envelope', () => {
    const result = extractMetaInbound(
      envelope({
        messages: [
          { from: '56911111111', type: 'text', text: { body: 'INICIO OT-1' } },
          { from: '56922222222', type: 'text', text: { body: 'INICIO OT-2' } },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.messages.map((m) => m.from)).toEqual(['+56911111111', '+56922222222']);
  });

  it('omits the timestamp when it is not a valid Unix-seconds string', () => {
    const result = extractMetaInbound(
      envelope({
        messages: [
          { from: '56912345678', type: 'text', timestamp: 'not-a-number', text: { body: 'INICIO OT-1' } },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.messages[0].timestamp).toBeUndefined();
  });

  it('rejects payloads that are not a Cloud API envelope', () => {
    expect(extractMetaInbound({ from: '+569', body: 'hola' }).ok).toBe(false);
    expect(extractMetaInbound({ object: 'page', entry: [] }).ok).toBe(false);
    expect(extractMetaInbound(null).ok).toBe(false);
  });
});
