'use client';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';

import { VistoBuenoDialog } from '@/components/workflow/VistoBuenoDialog';
import { Plus } from 'lucide-react';
import { useOTs } from '@/hooks/use-operations-queries';
import { useQuery } from '@tanstack/react-query';
import { useMachines } from '@/hooks/use-operations-queries';
import { EMPTY_FINISHES } from '@/types/ot';
import { priceBand } from '@/lib/ot-spec';
import { stashHandoff } from '@/lib/ot-handoff';
import { SERIES } from '@/components/financial/charts/viz-tokens';
import { RepetirTrabajo } from '@/components/comercial/RepetirTrabajo';
import { useCostCatalog, useMaterialCost } from '@/hooks/use-cost-catalog';
import { buildEstimate, type Coverage, type PressRef } from './cotizaciones-shared';
import { CotizacionSpecSection, type CotizacionFormState } from './CotizacionSpecSection';
import { CotizacionPricingSection } from './CotizacionPricingSection';
import { EsperandoVistoBuenoTable } from './EsperandoVistoBuenoTable';

export default function CotizacionesModule() {
  const qc = useQueryClient();
  const router = useRouter();

  const { data: ots = [] } = useOTs();

  /**
   * Las que todavía no tienen la prueba firmada.
   *
   * `pre_press` y `visto_bueno` son los dos estados antes del punto de no
   * retorno. En cuanto una orden pasa a compra de papel deja de ser asunto del
   * vendedor: ya está comprometida y vive en el tablero de producción.
   */
  const esperando = useMemo(
    () =>
      (ots as any[])
        .filter((o) => o.status === 'pre_press' || o.status === 'visto_bueno')
        .sort((a, b) => String(a.deadline ?? '9999').localeCompare(String(b.deadline ?? '9999'))),
    [ots],
  );

  // La cartera completa, no sólo quien ya tiene una OT.
  //
  // Antes esta lista se armaba recorriendo las órdenes existentes, así que sólo
  // ofrecía clientes a los que YA se les había vendido. Es exactamente al revés
  // de para qué sirve una cotización: el caso normal es un cliente nuevo, o uno
  // que hace tiempo no pide nada. De trece clientes en la base, el desplegable
  // mostraba uno.
  const { data: clients = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['clients', 'todos'],
    queryFn: async () => {
      const r = await fetch('/api/clients?q=', { credentials: 'include' });
      if (!r.ok) throw new Error('No se pudo cargar la cartera');
      const j = await r.json();
      return (Array.isArray(j) ? j : j?.data ?? []).map((c: any) => ({ id: c.id, name: c.name }));
    },
  });

  // Las prensas del taller. La elegida decide el pliego que se puede montar, y
  // eso mueve el precio más que cualquier otro campo de esta pantalla.
  const { data: maquinas = [] } = useMachines();
  const prensas: PressRef[] = useMemo(
    () => (maquinas as any[])
      // La digital también imprime. Estaba fuera del desplegable, así que un
      // tiraje corto —donde la digital gana por no tener alistamiento— no se
      // podía ni cotizar en la máquina que le corresponde.
      .filter((m) => ['offset_printer', 'digital_printer'].includes(m.type) && m.is_active !== false)
      .map((m) => ({
        id: m.id,
        name: m.name,
        type: m.type,
        bodies: m.colors ?? 4,
        speedSheetsHr: m.optimal_speed_sheets_hr ?? m.nominal_speed_sheets_hr ?? 3000,
        // La ficha guarda milímetros; la imposición razona en centímetros.
        maxWidthCm: m.max_print_width_mm ? m.max_print_width_mm / 10 : 37,
        maxHeightCm: m.max_print_height_mm ? m.max_print_height_mm / 10 : 52,
      }))
      // La más capaz primero: una prensa de cuatro cuerpos resuelve un CMYK en
      // una pasada y la de un cuerpo necesita cuatro. Dejar arriba la de menos
      // cuerpos hace que el precio por defecto salga del caso peor.
      .sort((a, b) => b.bodies - a.bodies || a.name.localeCompare(b.name)),
    [maquinas],
  );

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [decidiendo, setDecidiendo] = useState<{ id: string; numero: string; cliente: string } | null>(null);
  // Mismas tarifas que producción: catálogo compartido + costo de material
  // ponderado por compras. Si el vendedor cotiza con otros números, el taller
  // factura una cosa y la cotización prometió otra.
  const { data: catalog = [] } = useCostCatalog();
  const { data: materialCost = [] } = useMaterialCost();

  const [form, setForm] = useState<CotizacionFormState>({
    client_id: '', client_name: '', product_name: '', product_type: 'etiqueta', quantity: 100000,
    width_cm: 9, height_cm: 12, grammage_gsm: 115,
    colors_front: 4, colors_back: 0, coverage: 'medium' as Coverage,
    finishes: { ...EMPTY_FINISHES } as Record<string, boolean>,
    variable_data: false,
    die_new: false,
    substrate_type: 'couche',
    press_id: '',
    deadline: '',
    priority_level: 'normal',
    markup: 35,
  });

  // Sin elección explícita se asume la primera prensa del taller. Cotizar sin
  // prensa no es una opción: era lo que producía la imposición imposible.
  const prensaElegida = useMemo(
    () => prensas.find((m) => m.id === form.press_id) ?? prensas[0] ?? null,
    [prensas, form.press_id],
  );

  const calc = useMemo(() => {
    const { lines, subtotal, calcs, impo } = buildEstimate(form, catalog, materialCost, prensaElegida);
    const total = Math.round(subtotal * (1 + form.markup / 100));
    const floor = Math.round(subtotal * 1.10);
    const unit = form.quantity > 0 ? total / form.quantity : 0;
    const marginPct = total > 0 ? Math.round(((total - subtotal) / total) * 100) : 0;
    // Techo de sensatez, no un tope duro: 999.999.999 unidades pasaban sin
    // ningún comentario y calculaban 13.600 horas de prensa para un solo
    // trabajo — más de un año y medio de máquina continua (auditoría
    // 2026-09). No se bloquea "Crear OT" por esto, a propósito: un tiraje
    // gigante pero real puede existir, y la misma regla que usa
    // `stage-report.ts` ("duro con lo imposible, blando con lo raro") dice
    // que lo que hace falta es una advertencia visible, no un muro que un
    // pedido legítimo no pueda cruzar.
    const horas = calcs.calc_print_hours + calcs.calc_finish_hours;
    const sanityWarning =
      horas > 200
        ? `${Math.round(horas).toLocaleString('es-CL')} horas de máquina para este trabajo — más de cinco semanas de un turno completo. Revisá la cantidad antes de cotizar.`
        : null;
    return { lines, subtotal, total, floor, unit, marginPct, belowFloor: total < floor, calcs, impo, sanityWarning };
  }, [form, catalog, materialCost, prensaElegida]);

  // Lo que la cotización sabe, en el vocabulario de `ot-spec`. Lo que Pre-Prensa
  // agrega —marca del papel, montaje confirmado, arte— todavía no existe acá, y
  // eso es exactamente lo que ensancha la banda.
  /**
   * El costo agrupado, para la barra.
   *
   * El color sigue a la PARTIDA y en orden fijo: quien aprendió que el papel es
   * azul no debe encontrárselo naranja al cambiar de trabajo. Sale de la paleta
   * validada de los gráficos, no de colores elegidos a ojo.
   */
  const grupos = useMemo(() => {
    const PARTIDAS = [
      { key: 'materiales',    label: 'Materiales' },
      { key: 'impresion',     label: 'Máquina' },
      { key: 'terminaciones', label: 'Terminaciones' },
      { key: 'otros',         label: 'Generales' },
    ] as const;

    const total = calc.subtotal || 1;
    return PARTIDAS.map((p, i) => {
      const monto = calc.lines
        .filter((l) => l.category === p.key)
        .reduce((s, l) => s + l.quantity * l.unit_cost, 0);
      return {
        ...p,
        monto,
        pct: Math.round((monto / total) * 1000) / 10,
        color: SERIES.light[i],
      };
    }).filter((g) => g.monto > 0);
  }, [calc.lines, calc.subtotal]);

  const banda = useMemo(() => {
    const spec = {
      clientId: form.client_id, productType: form.product_type, quantity: form.quantity,
      widthCm: form.width_cm, heightCm: form.height_cm,
      substrateType: form.substrate_type, grammageGsm: form.grammage_gsm,
      colorFront: String(form.colors_front), deadline: form.deadline,
      pressId: prensaElegida?.id ?? null,
      finishes: form.finishes,
    };
    return priceBand(spec, calc.total);
  }, [form, prensaElegida, calc.total]);

  const save = async () => {
    if (!form.client_id || !form.client_name) {
      toast.error('Elegí un cliente de la lista, o creá uno nuevo.');
      return;
    }
    // Un ancho o alto en cero pasaba la calculadora sin que nadie lo notara
    // -daba un pliego, un costo y un precio "válidos" para una etiqueta que
    // no existe- y la cantidad y el gramaje tienen el mismo problema
    // (auditoría 2026-09). Ninguno de los cuatro tiene sentido en cero.
    if (form.quantity <= 0 || form.width_cm <= 0 || form.height_cm <= 0 || form.grammage_gsm <= 0) {
      toast.error('Cantidad, ancho, alto y gramaje tienen que ser mayores que cero.');
      return;
    }
    const client = { id: form.client_id, name: form.client_name };
    if (calc.belowFloor) { toast.error('El precio está bajo el piso de costo'); return; }
    setSaving(true);
    const res = await fetch('/api/vistos-buenos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: client.id, client_name: client.name,
        product_name: form.product_name || 'Trabajo de impresión',
        product_type: form.product_type, quantity: form.quantity,
        deadline: form.deadline || null,
        priority_level: form.priority_level,
        // La prensa viaja: es lo que decide el pliego, y la OT la necesita para
        // que Pre-Prensa no tenga que volver a elegirla.
        press_id: prensaElegida?.id ?? null,
        finishes: form.finishes,
        width_cm: form.width_cm, height_cm: form.height_cm, grammage_gsm: form.grammage_gsm,
        // El sustrato viajaba sin enviarse: la OT convertida heredaba el default
        // del esquema en vez del papel que el vendedor cotizó.
        substrate_type: form.substrate_type,
        color_front: String(form.colors_front), color_back: String(form.colors_back),
        ink_coverage: form.coverage,
        estimate_lines: calc.lines, subtotal_cost: calc.subtotal,
        // Lo que el motor ya calculó acá mismo -- antes se mostraba en el
        // diálogo y se perdía al crear la OT (auditoría 2026-09-01, F-2).
        calc_sheets: calc.calcs.calc_sheets,
        calc_substrate_kg: calc.calcs.calc_substrate_kg,
        calc_ink_kg: calc.calcs.calc_ink_kg,
        calc_plates: calc.calcs.calc_plates,
        calc_print_hours: calc.calcs.calc_print_hours,
        calc_finish_hours: calc.calcs.calc_finish_hours,
        markup_pct: form.markup, margin_pct: calc.marginPct,
        total_price: calc.total, unit_price: calc.unit, floor_price: calc.floor,
        status: 'draft',
      }),
    });
    if (!res.ok) {
      setSaving(false);
      const b = await res.json().catch(() => null);
      toast.error(b?.error ?? 'Error al guardar');
      return;
    }

    // Cotizar CREA LA ORDEN. Guardar y quedarse en `draft` dejaba la cotización
    // sin salida: el botón de generar OT sólo aparecía con la firma, y firmar
    // pedía el arte aprobado, que se produce en Pre-Prensa. Se pedía firmar un
    // papel en blanco para poder empezar a llenarlo.
    //
    // El visto bueno se firma después, sobre la prueba. Acá nace la OT y entra a
    // Pre-Prensa, que es donde alguien la completa.
    const creada = await res.json().catch(() => null);
    const vbId = creada?.id ?? creada?.data?.id;
    if (vbId) {
      const conv = await fetch(`/api/vistos-buenos/${vbId}/convert`, { method: 'POST', credentials: 'include' });
      if (!conv.ok) {
        setSaving(false);
        const b = await conv.json().catch(() => null);
        toast.error(b?.error ?? 'Se guardó la cotización pero no se pudo crear la OT');
        qc.invalidateQueries({ queryKey: ['vistosBuenos'] });
        return;
      }
    }

    setSaving(false);
    toast.success('OT creada y encolada en Pre-Prensa');
    setOpen(false);
    qc.invalidateQueries({ queryKey: ['vistosBuenos'] });
    qc.invalidateQueries({ queryKey: ['ots'] });
    router.push('/operaciones/pre-prensa');
  };

  /**
   * Llevar lo escrito al asistente completo.
   *
   * No guarda la cotización: quien pide la ficha entera está diciendo que esto
   * no era una estimación sino una orden, y dejar además una cotización a medias
   * en la lista sería un registro que nadie pidió.
   */
  const completarTodo = () => {
    stashHandoff({
      client_id: form.client_id,
      client_name: form.client_name,
      product_name: form.product_name,
      product_type: form.product_type,
      quantity: form.quantity,
      width_cm: form.width_cm,
      height_cm: form.height_cm,
      grammage_gsm: form.grammage_gsm,
      substrate_type: form.substrate_type,
      colors_front: form.colors_front,
      colors_back: form.colors_back,
      coverage: form.coverage,
      finishes: form.finishes,
      deadline: form.deadline,
      priority_level: form.priority_level,
      press_id: prensaElegida?.id ?? '',
      markup: form.markup,
      precio_estimado: calc.total,
    });
    setOpen(false);
    router.push('/operaciones/kanban?asistente=1');
  };

  // Negativos entraban sin que nada los frenara: la calculadora en vivo se
  // quedaba mostrando el último resultado válido mientras el campo mostraba
  // "-15", así que precio y costo en pantalla ya no correspondían a lo
  // escrito (auditoría 2026-09). Un ancho, alto, gramaje o cantidad no
  // pueden ser negativos en la vida real, así que tampoco lo son acá.
  const num = (v: string) => Math.max(0, parseFloat(v) || 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {/* Cuenta LO QUE LA TABLA MUESTRA. Contaba filas de `vistos_buenos`
            —234— mientras la lista mostraba dos órdenes esperando visto bueno:
            un encabezado que describe otro conjunto que el de abajo enseña a
            desconfiar de los dos. */}
        <p className="text-sm text-muted-foreground">
          {esperando.length === 0
            ? 'Nada esperando visto bueno'
            : `${esperando.length} ${esperando.length === 1 ? 'orden espera' : 'órdenes esperan'} visto bueno`}
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Nueva Cotización</Button>
          </DialogTrigger>
          {/* `p-5 gap-3` y no el relleno por defecto: este diálogo es denso a
              propósito —una cotización se arma mirando todo junto— y veinticuatro
              píxeles de margen por lado son la diferencia entre entrar en una
              pantalla de 768 y no entrar. */}
          <DialogContent className="max-w-3xl gap-3 p-5">
            <DialogHeader><DialogTitle>Nueva Cotización</DialogTitle></DialogHeader>

            {/* La primera pregunta de una imprenta, no la última: la mayoría de
                los trabajos son repeticiones. El mismo bloque que abre el
                asistente de producción, con la misma regla — se copia el
                trabajo, nunca el precio. */}
            <RepetirTrabajo
              precioActual={calc.total}
              cantidadActual={form.quantity}
              onAplicar={(spec) => setForm((f) => ({
                ...f,
                client_id: spec.client_id || f.client_id,
                client_name: spec.client_name || f.client_name,
                product_name: spec.product_name,
                product_type: spec.product_type,
                quantity: spec.quantity,
                width_cm: spec.width_cm,
                height_cm: spec.height_cm,
                substrate_type: spec.substrate_type,
                grammage_gsm: spec.grammage_gsm,
                colors_front: spec.colors_front,
                colors_back: spec.colors_back,
                coverage: spec.ink_coverage,
              }))}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <CotizacionSpecSection
                form={form}
                setForm={setForm}
                prensas={prensas}
                prensaElegida={prensaElegida}
                calcSheets={calc.calcs?.calc_sheets ?? null}
                num={num}
              />
              <CotizacionPricingSection
                form={form}
                setForm={setForm}
                calc={calc}
                grupos={grupos}
                banda={banda}
                saving={saving}
                onSave={save}
                onCompletarTodo={completarTodo}
                num={num}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Lo que se vendió y todavía no se confirmó ──────────────────────

          Antes esta tabla listaba filas de `vistos_buenos`, que dejó de ser una
          cosa propia: cotizar CREA la orden. Un listado de cotizaciones al lado
          de un listado de órdenes son dos verdades sobre el mismo trabajo, y el
          vendedor tenía que cruzarlas con la vista para saber en qué anda algo.

          Ahora muestra ÓRDENES que todavía no tienen su visto bueno de prueba —
          `pre_press` y `visto_bueno`. Es la pregunta del vendedor: qué vendí que
          todavía no está confirmado con el cliente. Lo que ya pasó a compra de
          papel salió de su cancha y vive en el tablero. */}
      <EsperandoVistoBuenoTable esperando={esperando} onRegistrarVistoBueno={setDecidiendo} />

      {/* Quién decidió, contra qué, y —si dijo que no— por qué. Al guardar, un
          disparador copia el firmante al visto bueno, así que la lista se
          actualiza sola y no hay una segunda escritura que pueda discrepar. */}
      <VistoBuenoDialog
        otId={decidiendo?.id ?? null}
        otNumber={decidiendo?.numero}
        clientName={decidiendo?.cliente}
        open={decidiendo !== null}
        onOpenChange={(v) => { if (!v) setDecidiendo(null); }}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ['vistosBuenos'] });
          qc.invalidateQueries({ queryKey: ['ots'] });
        }}
      />
    </div>
  );
}
