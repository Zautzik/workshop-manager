import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAuthError, requireAuth } from '@/lib/api-middleware';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

const OPS = ['admin', 'manager', 'supervisor'] as const;
const IVA_RATE = 0.19; // Chile

// GET /api/sales-invoices[?ot_id=] — facturas de venta.
export async function GET(req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const otId = new URL(req.url).searchParams.get('ot_id');
  let query = supabaseAdmin
    .from('sales_invoices' as any)
    .select('*')
    .order('created_at', { ascending: false });
  if (otId) query = query.eq('ot_id', otId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

const CreateInvoiceSchema = z.object({
  ot_id: z.string().uuid().optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  client_name: z.string().max(255).optional().nullable(),
  // Se IGNORA cuando vienen `guide_ids`: ahí el neto lo deriva el servidor de
  // las guías y del precio de la OT. Sólo se usa en una factura suelta, sin
  // guías. Opcional para que un llamador que factura guías no tenga que
  // mandar un número que no se va a mirar.
  net_amount: z.coerce.number().min(0).optional().default(0),
  due_date: z.string().optional().nullable(),
  guide_ids: z.array(z.string().uuid()).optional().default([]),
  notes: z.string().max(2000).optional().nullable(),
});

// POST /api/sales-invoices — issue a factura de venta (IVA 19%) and bill the
// given guías de despacho (sets their invoice_id).
export async function POST(req: NextRequest) {
  const auth = await requireAuth([...OPS]);
  if (isAuthError(auth)) return auth;

  const body = await req.json().catch(() => null);
  const parsed = CreateInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const d = parsed.data;

  // ── Las guías primero: son las que fijan el monto y las que pueden estar ya
  //    facturadas ───────────────────────────────────────────────────────────
  //
  // Esta ruta tenía tres problemas en la misma función (auditoría 2026-10 §5A):
  // confiaba en el `net_amount` que mandaba el navegador, no miraba si las
  // guías ya tenían factura —así que una guía de despacho se podía facturar dos
  // veces— y marcaba las guías en una segunda escritura sin leer el error, con
  // lo cual una falla a mitad de camino dejaba la factura emitida y las guías
  // sin marcar, sin que nada lo reparara.
  let net: number;

  if (d.guide_ids.length > 0) {
    const { data: guias, error: guiasErr } = await supabaseAdmin
      .from('dispatch_guides' as any)
      .select('id, ot_id, quantity, status, invoice_id, guide_number')
      .in('id', d.guide_ids);

    if (guiasErr) return NextResponse.json({ error: guiasErr.message }, { status: 500 });

    // `as unknown as` y no `as`: el nombre de la tabla va castado a `any`
    // porque `dispatch_guides` todavía no está en los tipos generados, así que
    // el tipo del select es un `SelectQueryError` que no se solapa con la fila.
    const filas = (guias ?? []) as unknown as Array<{
      id: string; ot_id: string | null; quantity: number | null;
      status: string | null; invoice_id: string | null; guide_number: string | null;
    }>;

    if (filas.length !== d.guide_ids.length) {
      return NextResponse.json(
        { error: 'Alguna guía de despacho no existe' },
        { status: 400 }
      );
    }

    // Una guía ya facturada no se vuelve a facturar. La pantalla ya filtraba
    // las que tienen `invoice_id`, pero esa es la regla escrita en un solo
    // lado: cualquier otro llamador podía cobrar lo mismo dos veces.
    const yaFacturadas = filas.filter((g) => g.invoice_id);
    if (yaFacturadas.length > 0) {
      return NextResponse.json(
        {
          error:
            `Ya se facturó ${yaFacturadas.length === 1 ? 'la guía' : 'las guías'} ` +
            yaFacturadas.map((g) => g.guide_number ?? g.id).join(', ') +
            '. Recargá la pantalla.',
        },
        { status: 409 }
      );
    }

    const canceladas = filas.filter((g) => g.status === 'cancelled');
    if (canceladas.length > 0) {
      return NextResponse.json(
        {
          error:
            'No se puede facturar una guía anulada: ' +
            canceladas.map((g) => g.guide_number ?? g.id).join(', '),
        },
        { status: 400 }
      );
    }

    // Todas las guías tienen que ser de la OT que se está facturando. Sin esto
    // se podían mezclar guías de dos OT distintas y valorizarlas todas al
    // precio unitario de una sola.
    const otsDeLasGuias = new Set(filas.map((g) => g.ot_id).filter(Boolean));
    if (otsDeLasGuias.size > 1) {
      return NextResponse.json(
        { error: 'Las guías son de OT distintas; hay que facturarlas por separado' },
        { status: 400 }
      );
    }
    const otIdGuias = [...otsDeLasGuias][0] ?? null;
    if (d.ot_id && otIdGuias && d.ot_id !== otIdGuias) {
      return NextResponse.json(
        { error: 'Las guías no pertenecen a la OT indicada' },
        { status: 400 }
      );
    }

    const otId = d.ot_id ?? otIdGuias;
    if (!otId) {
      return NextResponse.json(
        { error: 'No se pudo resolver la OT de las guías' },
        { status: 400 }
      );
    }

    // El monto se deriva acá y se IGNORA el que mandó el navegador — la misma
    // decisión que ya toma `POST /api/purchases` con el total tipeado: dos
    // fuentes de la misma plata y ya se sabe cómo termina (NOTES.md). La regla
    // es la que la pantalla venía aplicando: precio unitario de la OT por las
    // unidades despachadas en estas guías.
    const { data: otRow, error: otErr } = await supabaseAdmin
      .from('ots')
      .select('quantity, total_price')
      .eq('id', otId)
      .maybeSingle();

    if (otErr) return NextResponse.json({ error: otErr.message }, { status: 500 });
    if (!otRow) return NextResponse.json({ error: 'OT no encontrada' }, { status: 404 });

    const ordered = Number((otRow as any).quantity ?? 0);
    const quoted = Number((otRow as any).total_price ?? 0);
    if (ordered <= 0 || quoted <= 0) {
      return NextResponse.json(
        {
          error:
            'La OT no tiene cantidad y precio para valorizar el despacho. ' +
            'Hay que cerrar el precio de la OT antes de facturar.',
        },
        { status: 409 }
      );
    }

    const unidades = filas.reduce((a, g) => a + Number(g.quantity ?? 0), 0);
    if (unidades <= 0) {
      return NextResponse.json(
        { error: 'Las guías seleccionadas no despachan unidades' },
        { status: 400 }
      );
    }

    // CLP no muestra centavos → se redondea a peso entero, igual que la pantalla.
    net = Math.round(unidades * (quoted / ordered));
  } else {
    // Sin guías no hay de dónde derivar: es una factura suelta y el monto lo
    // pone quien la emite. Queda explícito que ESTE es el único caso en que el
    // número del navegador se usa.
    net = Math.round(d.net_amount);
  }

  const tax = Math.round(net * IVA_RATE);
  const total = net + tax;

  const { data, error } = await supabaseAdmin
    .from('sales_invoices' as any)
    .insert({
      ot_id: d.ot_id ?? null,
      client_id: d.client_id ?? null,
      client_name: d.client_name ?? null,
      net_amount: net,
      tax_amount: tax,
      total_amount: total,
      status: 'issued',
      due_date: d.due_date ?? null,
      notes: d.notes ?? null,
    } as any)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Marcar las guías como facturadas. El error SÍ se lee: antes se descartaba,
  // y una falla acá dejaba la factura emitida con las guías sin marcar — o sea
  // facturables de nuevo. Si falla, se borra la factura recién creada y se
  // contesta error, porque una factura que no marcó sus guías es peor que
  // ninguna factura.
  //
  // Lo correcto sería una función SQL que haga las dos escrituras en una
  // transacción, como `emitir_oc`. Esto es la compensación mientras esa función
  // no exista: `.is('invoice_id', null)` hace que la marca no pise una factura
  // ajena si alguien ganó la carrera entre la lectura de arriba y esta línea.
  if (d.guide_ids.length > 0) {
    const { data: marcadas, error: updErr } = await supabaseAdmin
      .from('dispatch_guides' as any)
      .update({ invoice_id: (data as any).id } as any)
      .in('id', d.guide_ids)
      .is('invoice_id', null)
      .select('id');

    const marcadasOk = (marcadas ?? []).length;
    if (updErr || marcadasOk !== d.guide_ids.length) {
      await supabaseAdmin.from('sales_invoices' as any).delete().eq('id', (data as any).id);
      return NextResponse.json(
        {
          error:
            updErr?.message ??
            'Otra factura tomó estas guías mientras se emitía esta. No se emitió nada; recargá la pantalla.',
        },
        { status: 409 }
      );
    }
  }

  return NextResponse.json({ data }, { status: 201 });
}
