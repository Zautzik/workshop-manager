import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const BUCKET = 'ot-attachments';

// GET /api/attachments/[id]/download
// Returns a short-lived signed URL for secure download.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;
    const db = supabaseAdmin as any;

    const { data: attachment, error } = await db
      .from('ot_attachments')
      .select('id, filename, storage_path, uploaded_by, ot_id, draft_id')
      .eq('id', id)
      .single();

    if (error || !attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    const canDownload =
      attachment.uploaded_by === auth.id ||
      auth.role === 'admin' ||
      auth.role === 'supervisor' ||
      auth.role === 'manager';

    if (!canDownload) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(attachment.storage_path, 60 * 10);

    if (signError || !signed?.signedUrl) {
      console.error('Error creating signed URL:', signError);
      return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
    }

    return NextResponse.json({
      id: attachment.id,
      filename: attachment.filename,
      download_url: signed.signedUrl,
      expires_in_seconds: 600,
    });
  } catch (error) {
    console.error('Error generating attachment download URL:', error);
    return NextResponse.json({ error: 'Failed to download attachment' }, { status: 500 });
  }
}
