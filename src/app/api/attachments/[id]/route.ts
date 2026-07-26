import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

const BUCKET = 'ot-attachments';

/**
 * DELETE /api/attachments/[id] — remove a wrongly-uploaded file.
 *
 * This route did not exist: once uploaded, an attachment was permanent, which
 * means the wrong arte could sit on an OT forever with no way to replace it.
 * Gated above operator level because evidence removal is sensitive — deleting
 * the approved visual from a signed VB un-defends the signature.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Se requiere un ID de adjunto válido' }, { status: 400 });
  }

  const { data: attachment } = await supabaseAdmin
    .from('ot_attachments')
    .select('id, storage_path, vb_id' as '*')
    .eq('id', id)
    .maybeSingle();

  if (!attachment) {
    return NextResponse.json({ error: 'Adjunto no encontrado' }, { status: 404 });
  }

  // If this is the ONLY evidence of a signed VB, refuse: removing it would
  // leave a signature defending nothing. Un-sign the VB first, then replace.
  const vbId = (attachment as { vb_id?: string | null }).vb_id;
  if (vbId) {
    const [{ data: vb }, { count }] = await Promise.all([
      supabaseAdmin.from('vistos_buenos' as any).select('status').eq('id', vbId).maybeSingle(),
      supabaseAdmin
        .from('ot_attachments')
        .select('id', { count: 'exact', head: true })
        .eq('vb_id' as any, vbId),
    ]);

    if ((vb as { status?: string } | null)?.status === 'signed' && (count ?? 0) <= 1) {
      return NextResponse.json(
        {
          error:
            'Es la única imagen de un Visto Bueno firmado: borrarla dejaría la firma sin respaldo. Vuelve el VB a borrador o sube el reemplazo primero.',
        },
        { status: 409 }
      );
    }
  }

  const { error: storageError } = await supabaseAdmin.storage
    .from(BUCKET)
    .remove([attachment.storage_path]);
  if (storageError) {
    // The DB row is the source of truth for enforcement; losing an orphan blob
    // is a cleanup nit, not a reason to keep the record.
    console.warn('Storage removal failed (continuing):', storageError.message);
  }

  const { error } = await supabaseAdmin.from('ot_attachments').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
