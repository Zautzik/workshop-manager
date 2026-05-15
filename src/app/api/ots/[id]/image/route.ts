import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const BUCKET = 'ot-images';
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;

  const otId = params.id;
  if (!otId) {
    return NextResponse.json({ error: 'OT id required' }, { status: 400 });
  }

  // Verify OT exists
  const { data: ot, error: otErr } = await supabaseAdmin
    .from('ots')
    .select('id')
    .eq('id', otId)
    .single();

  if (otErr || !ot) {
    return NextResponse.json({ error: 'OT not found' }, { status: 404 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'File type not allowed. Use JPEG, PNG, WebP or GIF.' }, { status: 400 });
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File too large. Maximum size is 5 MB.' }, { status: 400 });
  }

  const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
  const storagePath = `${otId}/product.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const fileBuffer = new Uint8Array(arrayBuffer);

  // Upsert (overwrite if exists)
  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  const publicUrl = publicUrlData.publicUrl;

  const { error: updateErr } = await supabaseAdmin
    .from('ots')
    .update({ product_image_url: publicUrl })
    .eq('id', otId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ url: publicUrl });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;

  const otId = params.id;

  // Try to remove all common extensions
  const exts = ['jpg', 'png', 'webp', 'gif'];
  for (const ext of exts) {
    await supabaseAdmin.storage.from(BUCKET).remove([`${otId}/product.${ext}`]);
  }

  await supabaseAdmin.from('ots').update({ product_image_url: null }).eq('id', otId);

  return NextResponse.json({ success: true });
}
