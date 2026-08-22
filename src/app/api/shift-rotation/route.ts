import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

const ROSTER_KEY = 'weekend_shift_rotation';

/**
 * El orden de rotación del turno de sábado — un `employee_id` por posición.
 *
 * Vivía en `localStorage` bajo `workshop_weekend_rotation` (ver
 * WeekendShiftRotation.tsx): sólo lo veía el navegador donde alguien lo armó,
 * y un segundo admin, o el mismo admin en otro dispositivo, no encontraba
 * nada. `app_settings` ya es el lugar donde vive el resto de la configuración
 * chica y compartida (umbral de sobrecosto, piso de margen) — mismo patrón,
 * clave nueva.
 */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', ROSTER_KEY)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const roster = Array.isArray((data as { value?: unknown } | null)?.value)
    ? ((data as { value: unknown }).value as string[])
    : [];

  return NextResponse.json({ roster });
}

const PutSchema = z.object({
  roster: z.array(z.string().uuid()).max(200),
});

/** PUT — reemplaza el orden completo (el panel siempre manda la lista entera). */
export async function PUT(req: NextRequest) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor']);
  if (isAuthError(auth)) return auth;

  const parsed = PutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from('app_settings')
    .upsert({ key: ROSTER_KEY, value: parsed.data.roster } as never, { onConflict: 'key' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ roster: parsed.data.roster });
}
