import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, isAuthError } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { partTemplateFor, hasTemplate } from '@/lib/machine-part-templates';

export const dynamic = 'force-dynamic';

/**
 * GET — qué propone la plantilla para esta máquina, marcando lo que ya existe.
 * No escribe nada: es la lista para confirmar o tachar antes de aplicar.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  const machineId = new URL(req.url).searchParams.get('machine_id');
  if (!machineId || !z.string().uuid().safeParse(machineId).success) {
    return NextResponse.json({ error: 'Se requiere machine_id' }, { status: 400 });
  }

  const { data: machine } = await supabaseAdmin
    .from('machines')
    .select('id, name, type, usage_unit')
    .eq('id', machineId)
    .single();

  if (!machine) return NextResponse.json({ error: 'Máquina no encontrada' }, { status: 404 });

  const [{ data: systems }, { data: existing }] = await Promise.all([
    supabaseAdmin.from('machine_systems').select('id, code, name'),
    supabaseAdmin.from('machine_parts').select('name').eq('machine_id', machineId).eq('is_active', true),
  ]);

  const systemByCode = new Map((systems ?? []).map((s) => [s.code, s]));
  const yaExisten = new Set((existing ?? []).map((p) => p.name.trim().toLowerCase()));

  const items = partTemplateFor(machine.type)
    .filter((t) => systemByCode.has(t.system))
    .map((t) => ({
      ...t,
      system_id: systemByCode.get(t.system)!.id,
      system_name: systemByCode.get(t.system)!.name,
      already_present: yaExisten.has(t.name.trim().toLowerCase()),
    }));

  return NextResponse.json({
    machine,
    has_template: hasTemplate(machine.type),
    items,
    // Se dice explícitamente qué NO trae la plantilla, para que nadie suponga
    // que el plazo de reposición viene resuelto.
    missing_fields_notice:
      'La plantilla trae la pieza y su sistema. El número de parte, el proveedor, el plazo de reposición y la vida útil dependen de tu modelo y tu proveedor: cárgalos después en cada pieza. Sin plazo ni vida útil, la pieza queda como «sin datos» y no proyecta fecha.',
  });
}

const ApplySchema = z.object({
  machine_id: z.string().uuid(),
  items: z.array(z.object({
    system_id: z.string().uuid(),
    name: z.string().min(2).max(160),
    criticality: z.enum(['critica', 'alta', 'media', 'baja']),
    position: z.string().max(120).nullable().optional(),
  })).min(1).max(60),
});

/** POST — crea las piezas confirmadas. Idempotente por nombre dentro de la máquina. */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'supervisor', 'manager']);
  if (isAuthError(auth)) return auth;

  try {
    const parsed = ApplySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Plantilla inválida', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { machine_id, items } = parsed.data;

    const { data: existing } = await supabaseAdmin
      .from('machine_parts')
      .select('name')
      .eq('machine_id', machine_id)
      .eq('is_active', true);

    const yaExisten = new Set((existing ?? []).map((p) => p.name.trim().toLowerCase()));
    const nuevas = items.filter((i) => !yaExisten.has(i.name.trim().toLowerCase()));

    if (nuevas.length === 0) {
      return NextResponse.json({ created: 0, skipped: items.length, parts: [] });
    }

    const { data, error } = await supabaseAdmin
      .from('machine_parts')
      .insert(nuevas.map((i) => ({
        machine_id,
        system_id: i.system_id,
        name: i.name,
        criticality: i.criticality,
        position: i.position ?? null,
      })))
      .select('id, name');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      created: data?.length ?? 0,
      skipped: items.length - nuevas.length,
      parts: data ?? [],
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'No se pudo aplicar la plantilla' }, { status: 500 });
  }
}
