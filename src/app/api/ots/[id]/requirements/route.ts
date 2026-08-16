import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { proposeRequirements, stageState, stageSummary, type Requirement } from '@/lib/requirements';

export const dynamic = 'force-dynamic';

const OPS = ['admin', 'manager', 'supervisor'] as const;

const COLUMNAS =
  'id, ot_id, kind, description, item_id, quantity, unit, source, purchase_id, lot_id, status, notes, resolved_at';

/** De la fila de la base al modelo del dominio. Una sola traducción. */
function aDominio(r: Record<string, unknown>): Requirement & { id: string } {
  return {
    id: String(r.id),
    kind: r.kind as Requirement['kind'],
    description: String(r.description),
    itemId: (r.item_id as string) ?? null,
    quantity: r.quantity == null ? null : Number(r.quantity),
    unit: (r.unit as string) ?? null,
    source: r.source as Requirement['source'],
    purchaseId: (r.purchase_id as string) ?? null,
    lotId: (r.lot_id as string) ?? null,
    status: r.status as Requirement['status'],
    notes: (r.notes as string) ?? null,
  };
}

/**
 * GET — lo que la OT necesita.
 *
 * Si todavía no hay nada cargado, devuelve una PROPUESTA deducida de la ficha
 * en vez de una lista vacía. Partir de una hoja en blanco es lo que hace que
 * los pantones se olviden: la ficha ya sabe que el trabajo lleva dos, y
 * pedirle a alguien que los transcriba es pedirle que los pierda.
 *
 * La propuesta NO se guarda sola. Alguien la mira, la corrige y la acepta —
 * escribirla sin que nadie la vea la convertiría en verdad sin haber sido
 * revisada nunca.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('ot_requirements')
    .select(`${COLUMNAS}, updated_at`)
    .eq('ot_id', id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const guardados = ((data ?? []) as unknown as Record<string, unknown>[]).map(aDominio);
  if (guardados.length > 0) {
    const estado = stageState(guardados);
    // La marca de tiempo viaja al cliente y vuelve al guardar: es lo que
    // permite detectar que alguien más editó en el medio.
    const vistoEn = ((data ?? []) as unknown as Record<string, unknown>[])
      .map((r) => String(r.updated_at ?? ''))
      .sort()
      .pop() ?? null;
    return NextResponse.json({
      requisitos: guardados,
      estado,
      resumen: stageSummary(estado),
      propuesta: false,
      visto_en: vistoEn,
    });
  }

  const { data: otRow } = await supabaseAdmin
    .from('ots')
    .select(
      'quantity, substrate_type, grammage_gsm, pantone_colors, color_front, color_back, product_type, ' +
      'finish_troquelado, finish_plegado, finish_pegado, finish_laminado, finish_barniz, ' +
      'finish_relieve, finish_perforado, finish_hot_stamping, finish_uv_localizado, finish_numeracion, ' +
      // El troquel: si Pre-Prensa ya eligió uno del estante, el requisito nace
      // resuelto en vez de pedir algo que ya está.
      'die_source, die_code, die_id, calc_sheets'
    )
    .eq('id', id)
    .maybeSingle();

  if (!otRow) return NextResponse.json({ error: 'OT no encontrada' }, { status: 404 });

  const o = otRow as unknown as Record<string, unknown>;
  const propuesta = proposeRequirements({
    quantity: o.quantity as number,
    substrateType: o.substrate_type as string,
    grammageGsm: o.grammage_gsm as number,
    pantoneColors: (o.pantone_colors as string[]) ?? null,
    colorFront: o.color_front as string,
    colorBack: o.color_back as string,
    productType: o.product_type as string,
    dieSource: o.die_id ? 'existente' : (o.die_source as string),
    dieCode: (o.die_id ?? o.die_code) as string,
    sheets: o.calc_sheets as number,
    finishes: Object.fromEntries(
      Object.entries(o)
        .filter(([k]) => k.startsWith('finish_'))
        .map(([k, v]) => [k, !!v])
    ),
  });

  const estado = stageState(propuesta);
  return NextResponse.json({ requisitos: propuesta, estado, resumen: stageSummary(estado), propuesta: true });
}

const FilaSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(['papel', 'tinta_especial', 'envase', 'servicio', 'insumo', 'otro']),
  description: z.string().min(1).max(300),
  item_id: z.string().uuid().nullish(),
  quantity: z.coerce.number().min(0).nullish(),
  unit: z.string().max(20).nullish(),
  source: z.enum(['comprar', 'bodega', 'tercerizar']),
  purchase_id: z.string().uuid().nullish(),
  lot_id: z.string().uuid().nullish(),
  status: z.enum(['pendiente', 'en_curso', 'resuelto', 'no_aplica']).default('pendiente'),
  notes: z.string().max(1000).nullish(),
});

/**
 * PUT — guardar la lista completa.
 *
 * Reemplaza en vez de acumular, igual que las maquetas: esta pantalla se usa
 * para CORREGIR una lista —«el pantone es el 485, no el 486»— y una que acumula
 * convierte cada corrección en un duplicado.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const parsed = z
    .object({
      requisitos: z.array(FilaSchema).max(60),
      /** Lo que el cliente vio al abrir. Sin esto no se puede detectar la pisada. */
      visto_en: z.string().nullish(),
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.issues }, { status: 400 });
  }

  const filas = parsed.data.requisitos.map((r) => ({
    kind: r.kind,
    description: r.description.trim(),
    item_id: r.item_id ?? null,
    quantity: r.quantity ?? null,
    unit: r.unit ?? null,
    source: r.source,
    purchase_id: r.purchase_id ?? null,
    lot_id: r.lot_id ?? null,
    status: r.status,
    notes: r.notes ?? null,
  }));

  // Borrar e insertar en UNA transacción, del lado de la base.
  //
  // Antes eran dos llamadas sueltas desde acá: si la segunda fallaba —una
  // violación de CHECK, un corte— los requisitos quedaban borrados y los
  // nuevos no habían entrado. El usuario veía un error y había perdido la
  // lista que acababa de armar.
  const { error } = await supabaseAdmin.rpc('reemplazar_requisitos' as never, {
    p_ot_id: id,
    p_filas: filas,
    p_by: auth.id,
    p_visto_en: parsed.data.visto_en ?? null,
  } as never);

  if (error) {
    // La edición simultánea se reconoce por el mensaje y no por el código: el
    // código de RAISE es P0001 genérico a propósito, porque 40001
    // —serialization_failure— hace que el cliente reintente en bucle hasta el
    // timeout en vez de mostrar el problema.
    const pisada = /guardó esta lista/.test(error.message);
    if (pisada) {
      return NextResponse.json({ error: error.message, code: 'EDICION_SIMULTANEA' }, { status: 409 });
    }

    // Las violaciones de CHECK llegan en el idioma de Postgres —«violates check
    // constraint ot_requirements_resuelto_tiene_rastro»— que no le dice nada a
    // nadie. La regla la conoce la aplicación, así que la explica ella.
    const humano = /ot_requirements_resuelto_tiene_rastro/.test(error.message)
      ? 'Un requisito no se puede marcar resuelto sin decir cómo: falta la OC, o el lote del que sale.'
      : /ot_requirements_un_solo_camino/.test(error.message)
        ? 'Un requisito sale de una compra o de bodega, no de las dos.'
        : /ot_requirements_kind_valido|ot_requirements_source_valido/.test(error.message)
          ? 'Ese tipo o esa forma de conseguirlo no son válidos.'
          : error.message;

    return NextResponse.json({ error: humano, code: 'INVALIDO' }, { status: 400 });
  }

  const estado = stageState(
    filas.map((f) => ({
      kind: f.kind,
      description: f.description,
      source: f.source,
      status: f.status,
      purchaseId: f.purchase_id,
      lotId: f.lot_id,
    }))
  );

  return NextResponse.json({ estado, resumen: stageSummary(estado) });
}
