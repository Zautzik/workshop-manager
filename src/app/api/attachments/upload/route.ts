import { NextRequest, NextResponse } from 'next/server';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const BUCKET = 'ot-attachments';
const MAX_SIZE = 50 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/tiff',
  'application/postscript',
]);

async function ensureBucketExists() {
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  const exists = (buckets ?? []).some((bucket) => bucket.name === BUCKET);

  if (!exists) {
    await supabaseAdmin.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: `${MAX_SIZE}`,
    });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const otId = (formData.get('ot_id') as string | null) ?? null;
    const draftId = (formData.get('draft_id') as string | null) ?? null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    if (!otId && !draftId) {
      return NextResponse.json({ error: 'ot_id or draft_id is required' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 50 MB' }, { status: 400 });
    }

    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    await ensureBucketExists();

    const now = Date.now();
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const folder = otId ? `ot/${otId}` : `draft/${draftId}`;
    const storagePath = `${folder}/${now}_${cleanName}`;

    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, bytes, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('Error uploading attachment:', uploadError);
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }

    const db = supabaseAdmin;
    const { data: attachment, error: insertError } = await db
      .from('ot_attachments')
      .insert([
        {
          ot_id: otId,
          draft_id: draftId,
          filename: file.name,
          storage_path: storagePath,
          file_size: file.size,
          mime_type: file.type || null,
          uploaded_by: auth.id,
        },
      ])
      .select('*')
      .single();

    if (insertError || !attachment) {
      console.error('Error saving attachment record:', insertError);
      return NextResponse.json({ error: 'Failed to save attachment metadata' }, { status: 500 });
    }

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    console.error('Error in attachment upload:', error);
    return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 });
  }
}
