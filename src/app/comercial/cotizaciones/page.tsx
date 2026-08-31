'use client';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';

import { VistoBuenoDialog } from '@/components/workflow/VistoBuenoDialog';
import { Plus, PenLine, ArrowRight, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { useVistosBuenos } from '@/hooks/use-commercial-queries';
import { useOTs } from '@/hooks/use-operations-queries';
import { useQuery } from '@tanstack/react-query';
import { useMachines } from '@/hooks/use-operations-queries';
import { formatCLP } from '@/lib/format';
import { computeOTCalculations, computeImposition, generateDefaultOperations } from '@/lib/ot-calculations';
import { resolveCostOverrides } from '@/lib/costing-resolver';
import { useCostCatalog, useMaterialCost } from '@/hooks/use-cost-catalog';
import type { OTFormData } from '@/types/ot';
import { EMPTY_FINISHES } from '@/types/ot';
import { priceBand } from '@/lib/ot-spec';
import { stashHandoff } from '@/lib/ot-handoff';
import { SERIES } from '@/components/financial/charts/viz-tokens';
import { otStatusBadgeClass, otStatusLabel } from '@/lib/status-labels';
import Link from 'next/link';
import { RepetirTrabajo } from '@/components/comercial/RepetirTrabajo';
import { PapelEnBodega } from '@/components/comercial/PapelEnBodega';
import { ClientAutocomplete } from '@/components/workflow/ot-wizard/ClientAutocomplete';
import type { CostCenterItem } from '@/types/work-category';

const INK_COVERAGE = { light: 0.5, medium: 1, heavy: 2 } as const;
type Coverage = keyof typeof INK_COVERAGE;

interface EstimateLine { category: string; description: string; quantity: number; unit: string; unit_cost: number; }

/** Las terminaciones que el taller ofrece, con el nombre que usa el vendedor. */
const TERMINACIONES = [
  { key: 'finish_troquelado', label: 'Troquelado' },
  { key: 'finish_plegado', label: 'Plegado' },
  { key: 'finish_pegado', label: 'Pegado' },
  { key: 'finish_laminado', label: 'Laminado' },
  { key: 'finish_barniz', label: 'Barniz' },
  { key: 'finish_relieve', label: 'Relieve' },
  { key: 'finish_perforado', label: 'Perforado' },
  { key: 'finish_hot_stamping', label: 'Hot stamping' },
  { key: 'finish_uv_localizado', label: 'UV localizado' },
  { key: 'finish_numeracion', label: 'Numeración' },
] as const;

/** Los productos que el taller sabe hacer. Antes toda cotización nacía «etiqueta». */
const TIPOS_PRODUCTO = [
  { key: 'etiqueta', label: 'Etiqueta' },
  { key: 'caja_plegadiza', label: 'Caja plegadiza' },
  { key: 'caja_display', label: 'Caja display' },
  { key: 'volante', label: 'Volante' },
  { key: 'afiche', label: 'Afiche' },
  { key: 'brochure', label: 'Folleto' },
  { key: 'carpeta', label: 'Carpeta' },
  { key: 'sobre', label: 'Sobre' },
  { key: 'bolsa', label: 'Bolsa' },
  { key: 'otro', label: 'Otro' },
] as const;

const COLOR_MODE_BY_COUNT: Record<number, string> = {
  0: 'sin_impresion', 1: '1_color', 2: '2_color', 3: '3_color', 4: 'cmyk', 5: 'cmyk_pantone',
};

/**
 * El presupuesto del vendedor usa EL MISMO motor que producción.
 *
 * Antes esta pantalla tenía su propia fórmula: un pliego 72×102 fijo, 50
 * pliegos de alistamiento planos, 2% de merma y tarifas escritas a mano
 * (papel 1.800/kg, prensa 25.000/h). El motor v2 —el calibrado, el que corre
 * el taller— modela cuatro formatos reales con pinza y sangrado, pasadas
 * reales (4/0 en una prensa de 4 cuerpos es UNA pasada, no cuatro),
 * alistamiento por pasada y tarifas del catálogo.
 *
 * O sea: el vendedor cotizaba con una matemática distinta a la que después
 * factura el taller. Dos verdades de costo, la misma clase de problema que
 * este proyecto lleva meses cerrando. Ahora hay una sola — y cuando Guillermo
 * calibre §6.6, las cotizaciones mejoran solas.
 */
export interface PressRef {
  id: string;
  name: string;
  /** `offset_printer` u `digital_printer`: cambian de economía, no sólo de nombre. */
  type: string;
  bodies: number;
  speedSheetsHr: number;
  maxWidthCm: number;
  maxHeightCm: number;
}

function buildEstimate(
  s: {
    quantity: number; width_cm: number; height_cm: number; grammage_gsm: number;
    colors_front: number; colors_back: number; substrate_type: string;
    finishes: Record<string, boolean>;
    variable_data: boolean;
    die_new: boolean;
    coverage: Coverage;
  },
  catalog: CostCenterItem[],
  materialCost: any[],
  press: PressRef | null
) {
  const calcInput = {
    quantity: s.quantity,
    width_cm: s.width_cm,
    height_cm: s.height_cm,
    grammage_gsm: s.grammage_gsm,
    substrate_type: s.substrate_type,
    color_front: COLOR_MODE_BY_COUNT[s.colors_front] ?? 'cmyk',
    color_back: COLOR_MODE_BY_COUNT[s.colors_back] ?? 'sin_impresion',
    finishes: s.finishes,
    variable_data: s.variable_data,
    die_new: s.die_new,
  } as unknown as OTFormData;

  // La cobertura del arte multiplica el consumo de tinta: un fondo sólido a
  // full come mucho más que una línea fina, y es el caso que se cotiza barato
  // y se imprime caro.
  // La prensa decide qué pliego se puede montar, y el pliego decide todo lo
  // demás: poses, cantidad de pliegos, kilos de papel y horas de máquina.
  //
  // Sin este límite el motor elegía el pliego que mejor aprovecha el papel —un
  // 77×110— que ninguna de las dos Ryobi del taller puede agarrar: su área
  // máxima es 37×52. Medido sobre 100.000 etiquetas de 9×12, la diferencia era
  // 1.667 pliegos contra 10.320, y un costo de $723.564 contra $1.056.750. El
  // vendedor cotizaba $976.811 y vendía a pérdida creyendo que ganaba 26%.
  const limit = press ? { maxWidthCm: press.maxWidthCm, maxHeightCm: press.maxHeightCm } : null;
  const impo = computeImposition(s.width_cm, s.height_cm, s.quantity, limit);
  // La imposición viaja DENTRO del formulario: `generateDefaultOperations` la
  // necesita para cobrar el corte previo de resma cuando el pliego de prensa
  // sale de partir uno de compra. Sin ella esa operación no se cotizaba.
  (calcInput as any).imposition = impo;
  const calcs = computeOTCalculations(calcInput, {
    inkCoverage: s.coverage,
    variableData: s.variable_data,
    digitalSpeedSheetsHr: press?.type === 'digital_printer' ? press.speedSheetsHr : undefined,
    pressLimit: limit,
    machineSpeedSheetsHr: press?.speedSheetsHr,
    pressBodies: press?.bodies,
  });
  const overrides = resolveCostOverrides(
    catalog,
    {
      color_front: calcInput.color_front,
      color_back: calcInput.color_back,
      substrate_type: s.substrate_type,
      grammage_gsm: s.grammage_gsm,
    },
    materialCost
  );

  const ops = generateDefaultOperations(calcInput, calcs, overrides);
  const lines: EstimateLine[] = ops.map((o) => ({
    category: o.category,
    description: o.name,
    quantity: o.quantity,
    unit: o.unit,
    unit_cost: o.unit_cost,
  }));

  const subtotal = Math.round(lines.reduce((acc, l) => acc + l.quantity * l.unit_cost, 0));
  return { lines, subtotal, calcs, impo };
}


function CotizacionesInner() {
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

  const [form, setForm] = useState({
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
    return { lines, subtotal, total, floor, unit, marginPct, belowFloor: total < floor, calcs, impo };
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

  const num = (v: string) => parseFloat(v) || 0;

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
              {/* Spec */}
              <div className="space-y-2.5">
                {/* Escribir y sugerir, no un desplegable. Con veinticuatro
                    cuentas —y creciendo— buscar en una lista desplegada es más
                    lento que teclear tres letras. El mismo componente que usa el
                    asistente de producción, que además sabe crear un cliente
                    nuevo sin salir de acá: es el caso normal de una cotización. */}
                <div>
                  <Label className="text-xs">Cliente</Label>
                  <ClientAutocomplete
                    clientName={form.client_name}
                    clientId={form.client_id}
                    onSelect={(c) => setForm((f) => ({ ...f, client_id: c.id, client_name: c.name }))}
                    onNameChange={(name) => setForm((f) => ({ ...f, client_name: name, client_id: '' }))}
                  />
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <div><Label>Producto</Label><Input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} placeholder="Ej: Etiqueta frasco 250ml" /></div>
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={form.product_type} onChange={(e) => setForm({ ...form, product_type: e.target.value })}>
                      {TIPOS_PRODUCTO.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div><Label className="text-xs">Cantidad</Label><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: num(e.target.value) })} /></div>
                  <div><Label className="text-xs">Ancho (cm)</Label><Input type="number" value={form.width_cm} onChange={(e) => setForm({ ...form, width_cm: num(e.target.value) })} /></div>
                  <div><Label className="text-xs">Alto (cm)</Label><Input type="number" value={form.height_cm} onChange={(e) => setForm({ ...form, height_cm: num(e.target.value) })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div><Label className="text-xs">Gramaje</Label><Input type="number" value={form.grammage_gsm} onChange={(e) => setForm({ ...form, grammage_gsm: num(e.target.value) })} /></div>
                  <div>
                    <Label className="text-xs">Sustrato</Label>
                    <select
                      className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={form.substrate_type}
                      onChange={(e) => setForm({ ...form, substrate_type: e.target.value })}
                    >
                      <option value="couche">Couché</option>
                      <option value="bond">Bond</option>
                      <option value="cartulina">Cartulina</option>
                      <option value="adhesivo">Adhesivo</option>
                      <option value="kraft">Kraft</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  {/* Frente y dorso juntos: son un solo dato del oficio —«4/0»,
                      «4/4»— y separarlos en dos filas costaba una fila entera. */}
                  <div>
                    <Label className="whitespace-nowrap text-xs">Colores f/d</Label>
                    <div className="flex items-center gap-1">
                      <Input type="number" value={form.colors_front} onChange={(e) => setForm({ ...form, colors_front: num(e.target.value) })} />
                      <span className="text-muted-foreground">/</span>
                      <Input type="number" value={form.colors_back} onChange={(e) => setForm({ ...form, colors_back: num(e.target.value) })} />
                    </div>
                  </div>
                </div>
                {/* Antes de mandar a comprar: qué hay parado en bodega que sirva.
                    Aparece acá y no en otra pantalla porque es EL momento — un
                    minuto después ya cotizó y el papel viejo sigue ahí. */}
                <PapelEnBodega
                  substrateType={form.substrate_type}
                  grammageGsm={form.grammage_gsm}
                  sheetsNeeded={calc.calcs?.calc_sheets ?? null}
                  widthCm={form.width_cm}
                  heightCm={form.height_cm}
                  productType={form.product_type}
                  onUsar={(sug) => {
                    // Se ajusta el gramaje cotizado al del papel que existe. El
                    // motor recalcula solo y el precio se mueve a la vista, que
                    // es lo que el vendedor necesita ver antes de ofrecerlo.
                    const g = sug.stock.grammageGsm;
                    if (g) setForm((f) => ({ ...f, grammage_gsm: g }));
                    toast.success(sug.pitch);
                  }}
                />

                <div className="grid grid-cols-2 gap-2 items-end">
                  <div>
                    <Label className="text-xs">Cobertura de tinta</Label>
                    <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={form.coverage} onChange={(e) => setForm({ ...form, coverage: e.target.value as Coverage })}>
                      <option value="light">Liviana</option>
                      <option value="medium">Media</option>
                      <option value="heavy">Alta (sólidos)</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Prensa</Label>
                    <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={prensaElegida?.id ?? ''} onChange={(e) => setForm({ ...form, press_id: e.target.value })}>
                      {prensas.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} · {m.maxWidthCm}×{m.maxHeightCm} cm</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Fecha de entrega</Label>
                    <Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Prioridad</Label>
                    <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={form.priority_level} onChange={(e) => setForm({ ...form, priority_level: e.target.value })}>
                      <option value="baja">Baja</option>
                      <option value="normal">Normal</option>
                      <option value="alta">Alta</option>
                      <option value="urgente">Urgente</option>
                    </select>
                  </div>
                </div>

                {/* Terminaciones de verdad. Eran una casilla que activaba sólo
                    plegado, y son entre el 15 y el 20% del costo — donde vive
                    el margen de un estuche. */}
                {/* Sólo si se troquela. Preguntar por un troquel en un trabajo
                    que no lleva troquelado es ruido, y el ruido enseña a saltear
                    campos. */}
                {form.finishes.finish_troquelado && (
                  <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-2.5 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={form.die_new}
                      onChange={(e) => setForm({ ...form, die_new: e.target.checked })}
                    />
                    <span>
                      <span className="font-medium">Hay que mandar a hacer el troquel</span>
                      <span className="block text-[11px] leading-snug text-muted-foreground">
                        Costo de una vez, no por pliego. Si el cliente repite un trabajo que
                        ya tiene matriz, dejalo sin marcar.
                      </span>
                    </span>
                  </label>
                )}

                {/* No es una terminación: es una SEGUNDA PASADA de impresión.
                    Va acá por cercanía visual, pero la etiqueta lo distingue —
                    confundirlo con un acabado haría que se costee como si fuera
                    trabajo de taller y no tiempo de máquina. */}
                <label className="flex items-start gap-2 rounded-md border border-border px-2.5 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={form.variable_data}
                    onChange={(e) => setForm({ ...form, variable_data: e.target.checked })}
                  />
                  <span>
                    <span className="font-medium">Dato variable</span>
                    <span className="block text-[11px] leading-snug text-muted-foreground">
                      Se tira en offset y se personaliza en digital: nombres, números,
                      códigos. Suma una pasada por la digital, que se cobra por clic.
                    </span>
                  </span>
                </label>

                <div>
                  <Label className="text-xs">Terminaciones</Label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {TERMINACIONES.map((t) => {
                      const activa = !!form.finishes[t.key];
                      return (
                        <button
                          key={t.key}
                          type="button"
                          aria-pressed={activa}
                          onClick={() => setForm({ ...form, finishes: { ...form.finishes, [t.key]: !activa } })}
                          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                            activa
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-input bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
                          }`}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* El precio se queda quieto mientras se edita la ficha.
                  El diálogo scrollea —la ficha es larga— y sin esto el número
                  que el vendedor está mirando se le va de la pantalla justo
                  cuando cambia. Es la razón por la que este diálogo recalcula en
                  vivo: que se vea moverse. */}
              <div className="space-y-2.5 md:sticky md:top-0 md:self-start">
                {/* ── El papel, en dos renglones ─────────────────────────
                    Eran seis filas de etiqueta y valor. El vendedor no lee una
                    tabla mientras habla por teléfono: mira si el número le
                    cuadra. Los mismos datos, en la forma en que se leen. */}
                <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                  <p className="text-sm">
                    <span className="text-lg font-bold tabular-nums text-primary">
                      {calc.calcs.calc_sheets.toLocaleString('es-CL')}
                    </span>{' '}
                    <span className="text-muted-foreground">pliegos de</span>{' '}
                    <span className="font-semibold text-foreground">{calc.impo.format_label ?? '—'}</span>
                    {calc.impo.cut_from && (
                      <span className="text-muted-foreground"> (cortados de {calc.impo.cut_from})</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {calc.impo.poses_per_sheet} poses · {calc.calcs.calc_substrate_kg.toFixed(1)} kg ·{' '}
                    {calc.calcs.calc_plates} planchas · {calc.calcs.calc_print_hours.toFixed(1)} h de prensa
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Con merma y alistamiento, del mismo motor que usa producción.
                  </p>
                </div>

                {/* ── El costo, como forma antes que como lista ─────────────
                    Diez renglones de cifras obligan a sumarlos con la vista para
                    saber lo único que importa a esta altura: en qué se va la
                    plata. Una barra de parte-sobre-el-todo lo dice de un vistazo
                    y ocupa un octavo del alto. El detalle sigue estando, un clic
                    más abajo, para cuando el cliente pregunta. */}
                <div className="rounded-md border border-border p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">Costo</span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">{formatCLP(calc.subtotal)}</span>
                  </div>

                  <div className="mt-2 flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
                    {grupos.map((g) => (
                      <div
                        key={g.key}
                        title={`${g.label}: ${formatCLP(g.monto)} (${g.pct}%)`}
                        style={{ width: `${g.pct}%`, background: g.color }}
                        className="h-full transition-all first:rounded-l-full last:rounded-r-full"
                      />
                    ))}
                  </div>

                  <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {grupos.map((g) => (
                      <li key={g.key} className="flex items-center gap-1.5 text-[11px]">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: g.color }} />
                        <span className="text-muted-foreground">{g.label}</span>
                        <span className="font-semibold tabular-nums text-foreground">{g.pct}%</span>
                      </li>
                    ))}
                  </ul>

                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] text-muted-foreground">
                      Ver las {calc.lines.length} líneas
                    </summary>
                    <div className="mt-1.5 space-y-0.5">
                      {calc.lines.map((l, i) => (
                        <div key={i} className="flex justify-between gap-2 text-xs">
                          <span className="truncate text-muted-foreground">{l.description}</span>
                          <span className="tabular-nums">{formatCLP(l.quantity * l.unit_cost)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>

                {/* ── El precio, el markup y la banda, juntos ───────────────
                    Es el bloque con el que se negocia: mover el markup, ver el
                    precio, mirar el piso. Separados obligaban a recorrer con la
                    vista para completar un solo pensamiento. */}
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs uppercase text-muted-foreground">Precio</span>
                    <span className="text-2xl font-bold tabular-nums text-primary">{formatCLP(calc.total)}</span>
                  </div>

                  <input
                    type="range" min={5} max={120} value={form.markup}
                    aria-label={`Markup ${form.markup}%`}
                    onChange={(e) => setForm({ ...form, markup: num(e.target.value) })}
                    className="mt-2 w-full accent-primary"
                  />
                  <div className="flex flex-wrap justify-between gap-x-3 text-[11px] tabular-nums text-muted-foreground">
                    <span>markup {form.markup}%</span>
                    <span>{formatCLP(calc.unit)} c/u</span>
                    <span>margen {calc.marginPct}%</span>
                    <span className={calc.belowFloor ? 'font-semibold text-red-500' : ''}>
                      piso {formatCLP(calc.floor)}
                    </span>
                  </div>

                  {calc.belowFloor && (
                    <p className="mt-1.5 text-xs font-medium text-red-500">
                      Bajo el piso de costo — subí el markup.
                    </p>
                  )}

                  {!banda.firm && banda.note && (
                    <details className="mt-2 border-t border-primary/20 pt-2">
                      <summary className="cursor-pointer text-xs text-amber-700 dark:text-amber-400">
                        Es una estimación: {formatCLP(banda.low)} – {formatCLP(banda.high)}
                      </summary>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{banda.note}</p>
                      <ul className="mt-1.5 space-y-1">
                        {banda.drivers.map((d) => (
                          <li key={d.field} className="flex items-baseline gap-2 text-[11px] leading-snug text-muted-foreground">
                            <span className="shrink-0 font-mono tabular-nums text-amber-700 dark:text-amber-400">
                              +{Math.round(d.up * 100)}%
                            </span>
                            <span>{d.why}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {banda.firm && (
                    <p className="mt-2 border-t border-primary/20 pt-2 text-xs text-emerald-700 dark:text-emerald-400">
                      Precio firme: no falta ningún dato que pueda moverlo.
                    </p>
                  )}
                </div>

                <Button className="w-full" onClick={save} disabled={saving || calc.belowFloor}>{saving ? 'Creando la OT…' : 'Crear OT'}</Button>

                {/* La salida para cuando la cotización no alcanza.
                    A veces el cliente ya decidió y lo que hace falta no es un
                    precio sino la orden entera: montaje, máquina, detalle de
                    producción. Sin esta puerta había que cerrar, abrir el
                    asistente y volver a escribir los quince campos recién
                    llenados — y el que teclea dos veces, la segunda pone otra
                    cosa. */}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={completarTodo}
                  disabled={!form.client_id}
                  title={!form.client_id ? 'Elegí un cliente primero' : undefined}
                >
                  <ArrowRight className="mr-1.5 h-4 w-4" />
                  Completar todos los datos
                </Button>
                <p className="-mt-1 text-[11px] leading-snug text-muted-foreground">
                  Abre el asistente con lo que ya escribiste y pide lo que falta para
                  tener la OT: montaje, máquina, detalle de producción y arte.
                </p>
              </div>
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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Esperando el visto bueno del cliente</CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Órdenes creadas que todavía no tienen la prueba firmada. Una vez firmada se
            compra el papel y se graban las planchas: hasta ahí se puede cambiar.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium">OT</th>
                  <th className="text-left py-2 px-3 font-medium">Cliente</th>
                  <th className="text-left py-2 px-3 font-medium">Producto</th>
                  <th className="text-right py-2 px-3 font-medium">Total</th>
                  <th className="text-center py-2 px-3 font-medium">Entrega</th>
                  <th className="text-center py-2 px-3 font-medium">Estado</th>
                  <th className="text-right py-2 px-3 font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {esperando.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-muted-foreground">
                      Nada esperando visto bueno. Creá una OT con el botón de arriba.
                    </td>
                  </tr>
                )}
                {esperando.map((ot: any) => (
                  <tr key={ot.id} className="border-b hover:bg-muted/40">
                    <td className="py-2 px-3 font-mono font-semibold">{ot.ot_number}</td>
                    <td className="py-2 px-3">{ot.client_name}</td>
                    <td className="py-2 px-3 text-muted-foreground">{ot.product_name}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{formatCLP(ot.total_price ?? 0)}</td>
                    <td className="py-2 px-3 text-center text-xs text-muted-foreground tabular-nums">
                      {ot.deadline
                        ? new Date(ot.deadline.length <= 10 ? `${ot.deadline}T00:00:00` : ot.deadline)
                            .toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
                        : '—'}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <Badge className={otStatusBadgeClass(ot.status)}>{otStatusLabel(ot.status)}</Badge>
                    </td>
                    <td className="py-2 px-3 text-right">
                      {/* La acción depende de dónde está parada la OT: en Pre-Prensa
                          falta completar la ficha; en Visto Bueno lo que falta es una
                          persona que decida, y eso hay que registrarlo con nombre. */}
                      {/* El documento para el cliente, en los dos momentos: antes
                          del visto bueno sale con banda, después con precio firme.
                          Se abre en pestaña nueva porque se comparte por enlace. */}
                      <Link
                        href={`/documentos/cotizacion/${ot.id}`}
                        target="_blank"
                        className="mr-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                      >
                        <FileSpreadsheet className="h-3 w-3" />
                        {ot.status === 'pre_press' ? 'Cotización' : 'Cotización final'}
                      </Link>
                      {ot.status === 'visto_bueno' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setDecidiendo({ id: ot.id, numero: ot.ot_number, cliente: ot.client_name })}
                        >
                          <ShieldCheck className="mr-1 h-3 w-3" />
                          Registrar visto bueno
                        </Button>
                      ) : (
                        <Link
                          href="/operaciones/pre-prensa"
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                        >
                          Completar ficha
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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

export default function CotizacionesPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor', 'vendedor']}>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-cyan-500/10 p-3"><FileSpreadsheet className="w-6 h-6 text-cyan-500" /></span>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Cotizaciones</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Cotizá y creá la orden. El visto bueno se firma después, sobre la prueba que sale de Pre-Prensa.</p>
          </div>
        </div>
        <CotizacionesInner />
      </div>
    </ProtectedRoute>
  );
}
