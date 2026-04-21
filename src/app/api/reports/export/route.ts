import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

const ExportSchema = z.object({
  report_type: z.string().min(1).max(100),
  format: z.enum(['csv', 'pdf']).default('csv'),
  filters: z.record(z.any()).optional(),
});

// GET /api/reports/export
// Lists current user's export requests.
export async function GET(_req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const db = supabaseAdmin as any;
    const query = db
      .from('reporting_exports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (auth.role !== 'admin') {
      query.eq('requested_by', auth.id);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching report exports:', error);
      return NextResponse.json({ error: 'Failed to fetch report exports' }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('Error in report exports GET:', error);
    return NextResponse.json({ error: 'Failed to fetch report exports' }, { status: 500 });
  }
}

// POST /api/reports/export
// Queues a report export job.
export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();
    const parsed = ExportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const db = supabaseAdmin as any;
    const { data, error } = await db
      .from('reporting_exports')
      .insert([
        {
          requested_by: auth.id,
          report_type: parsed.data.report_type,
          format: parsed.data.format,
          filters: parsed.data.filters ?? {},
          status: 'queued',
        },
      ])
      .select('*')
      .single();

    if (error || !data) {
      console.error('Error queueing report export:', error);
      return NextResponse.json({ error: 'Failed to queue report export' }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in report exports POST:', error);
    return NextResponse.json({ error: 'Failed to queue report export' }, { status: 500 });
  }
}
