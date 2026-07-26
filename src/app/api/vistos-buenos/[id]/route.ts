import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { resolveSalesScope, canActOnSalesRow } from '@/lib/sales-scope';

// PATCH /api/vistos-buenos/[id] — update status (e.g. mark signed).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['admin', 'manager', 'supervisor', 'vendedor']);
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  // Ownership: a vendedor may only act on their own quote.
  const scope = await resolveSalesScope(auth);
  if (!scope.all) {
    const { data: owner } = await supabaseAdmin
      .from('vistos_buenos' as any)
      .select('salesman_id')
      .eq('id', id)
      .single();
    if (!owner || !canActOnSalesRow(scope, (owner as any).salesman_id)) {
      return NextResponse.json({ error: 'No autorizado sobre esta cotización.' }, { status: 403 });
    }
  }

  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  // La imagen ES lo que el cliente firma. Un VB firmado sin el visual aprobado
  // es una firma sobre el aire: cuando llegue el reclamo de "me imprimieron el
  // pantone equivocado", no hay nada que mostrar. El servidor lo exige — un
  // botón deshabilitado en la UI es una sugerencia, un 400 es una regla.
  if (b.status === 'signed') {
    const { count } = await supabaseAdmin
      .from('ot_attachments')
      .select('id', { count: 'exact', head: true })
      .eq('vb_id' as any, id);

    if (!count || count === 0) {
      return NextResponse.json(
        {
          error:
            'No se puede firmar sin la imagen aprobada. Sube el visual que el cliente está aprobando — es lo único que defiende la firma después.',
          code: 'VB_SIN_IMAGEN',
        },
        { status: 400 }
      );
    }
  }

  const patch: Record<string, unknown> = {};
  if (b.status) patch.status = b.status;
  if (b.signed_by_name !== undefined) patch.signed_by_name = b.signed_by_name;
  if (b.status === 'signed') patch.signed_at = new Date().toISOString();
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('vistos_buenos' as any)
    .update(patch as any)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
