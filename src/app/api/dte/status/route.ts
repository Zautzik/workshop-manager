import { NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { dteConfigStatus } from '@/lib/dte';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dte/status — qué tan lista está la facturación electrónica.
 *
 * Dos mitades que se arreglan en lugares distintos: la conexión (variables de
 * entorno; se informa el NOMBRE de la que falta, nunca un valor) y los datos
 * (clientes sin giro o sin comuna, que el SII rechazaría). La segunda se puede
 * ir completando hoy, con la emisión todavía apagada.
 */
export async function GET() {
  const auth = await requireAuth(['admin', 'manager']);
  if (isAuthError(auth)) return auth;

  const config = dteConfigStatus();

  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('id, name, rut, giro, region_code, comuna_code' as any)
    .eq('is_active', true);

  // Sin la migración 20261125120000 las columnas no existen: se dice así, no
  // como un 500.
  if (error) {
    return NextResponse.json({ config, schemaReady: false, clients: null });
  }

  const rows = (data ?? []) as any[];
  const incompletos = rows
    .map((c) => ({
      id: c.id,
      name: c.name,
      missing: [
        !c.rut && 'RUT',
        !c.giro && 'giro',
        !c.region_code && 'región',
        !c.comuna_code && 'comuna',
      ].filter(Boolean) as string[],
    }))
    .filter((c) => c.missing.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return NextResponse.json({
    config,
    schemaReady: true,
    clients: { total: rows.length, ready: rows.length - incompletos.length, incompletos },
  });
}
