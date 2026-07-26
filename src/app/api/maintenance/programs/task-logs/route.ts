import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Weekly tick log: "task X was done on day N of week W".
 * Ticking upserts on (task_id, week_start, day_of_week); unticking deletes the row.
 */
const LogKeySchema = z.object({
  task_id: z.string().uuid(),
  program_id: z.string().uuid(),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD'),
  day_of_week: z.coerce.number().int().min(0).max(6),
  notes: z.string().max(2000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager', 'technician']);
  if (isAuthError(auth)) return auth;

  const userId = typeof auth === 'object' && 'id' in auth ? auth.id : null;

  try {
    const parsed = LogKeySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos del registro', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('program_task_logs')
      .upsert(
        {
          ...parsed.data,
          completed: true,
          // The server stamps who did it — a client can't claim to be someone else.
          completed_by: userId,
          completed_at: new Date().toISOString(),
        },
        { onConflict: 'task_id,week_start,day_of_week' }
      )
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudo registrar la tarea' }, { status: 500 });
  }
}

/** DELETE — untick: ?task_id=&week_start=&day_of_week= */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager', 'technician']);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const parsed = LogKeySchema.pick({ task_id: true, week_start: true, day_of_week: true }).safeParse({
    task_id: searchParams.get('task_id'),
    week_start: searchParams.get('week_start'),
    day_of_week: searchParams.get('day_of_week'),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Se requieren task_id, week_start y day_of_week válidos' },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from('program_task_logs')
    .delete()
    .eq('task_id', parsed.data.task_id)
    .eq('week_start', parsed.data.week_start)
    .eq('day_of_week', parsed.data.day_of_week);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
