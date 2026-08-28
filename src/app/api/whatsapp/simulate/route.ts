/**
 * @fileoverview WhatsApp Simulator — inject an operator message without Twilio/Meta.
 *
 * Runs the EXACT same pipeline as the real webhook (src/lib/whatsapp-ingest),
 * skipping only the provider signature (the caller is an authenticated
 * supervisor, not an external relay). Exists so the flagship capture flow is
 * demoable and testable before the Meta number is live (P2.6, demo plan).
 *
 * Enabled only in development (dev bypass) or when WHATSAPP_SIMULATOR=true —
 * disabled in production by default so it can't become a side door around
 * webhook signatures.
 *
 * GET  /api/whatsapp/simulate  → { enabled }  (panel visibility probe)
 * POST /api/whatsapp/simulate  → { from, body, profile_name?, media_url? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { isDevBypassEnabled } from '@/lib/dev-bypass-guard';
import { processMessage } from '@/lib/whatsapp-ingest';
import { processWarehousePhoto } from '@/lib/warehouse-photo-ingest';

const SIM_ROLES = ['admin', 'supervisor', 'manager'] as const;

function simulatorEnabled(): boolean {
  return isDevBypassEnabled || process.env.WHATSAPP_SIMULATOR === 'true';
}

const SimulateSchema = z.object({
  from: z.string().min(7).max(30).regex(/^\+?[\d\s\-()]+$/),
  // Vacío cuando el mensaje es SÓLO una foto, que es como manda bodega: el
  // texto viene dentro de la imagen, en el código de la etiqueta.
  body: z.string().max(500).optional().default(''),
  profile_name: z.string().max(100).optional(),
  media_url: z.string().url().max(2000).optional(),
  media_mime: z.string().max(100).optional(),
}).refine((d) => d.body.trim().length > 0 || !!d.media_url, {
  message: 'Mandá un texto o una foto.',
});

export async function GET() {
  const auth = await requireAuth([...SIM_ROLES]);
  if (isAuthError(auth)) return auth;
  return NextResponse.json({ enabled: simulatorEnabled() });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth([...SIM_ROLES]);
  if (isAuthError(auth)) return auth;

  if (!simulatorEnabled()) {
    return NextResponse.json(
      { error: 'El simulador está deshabilitado en este entorno (WHATSAPP_SIMULATOR=true para activarlo).' },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = SimulateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  // Una foto sin texto va por el camino de bodega: no hay nada que parsear, el
  // mensaje ES la imagen. Es el mismo desvío que hace el webhook real, para que
  // el simulador siga corriendo exactamente el código de producción.
  if (!parsed.data.body.trim() && parsed.data.media_url) {
    const photo = await processWarehousePhoto({
      from: parsed.data.from,
      media_url: parsed.data.media_url,
      media_mime: parsed.data.media_mime,
      profile_name: parsed.data.profile_name,
    });
    return NextResponse.json(photo.payload, { status: photo.status, headers: photo.headers });
  }

  const result = await processMessage({
    from: parsed.data.from,
    body: parsed.data.body,
    ProfileName: parsed.data.profile_name,
    media_url: parsed.data.media_url,
  });

  return NextResponse.json(result.payload, { status: result.status, headers: result.headers });
}
