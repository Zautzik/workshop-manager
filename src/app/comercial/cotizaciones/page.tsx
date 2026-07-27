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
import { Plus, PenLine, ArrowRight, FileSpreadsheet } from 'lucide-react';
import { useVistosBuenos } from '@/hooks/use-commercial-queries';
import { useOTs } from '@/hooks/use-operations-queries';
import { formatCLP } from '@/lib/format';
import { computeOTCalculations, computeImposition, generateDefaultOperations } from '@/lib/ot-calculations';
import { resolveCostOverrides } from '@/lib/costing-resolver';
import { useCostCatalog, useMaterialCost } from '@/hooks/use-cost-catalog';
import type { OTFormData } from '@/types/ot';
import type { CostCenterItem } from '@/types/work-category';

const INK_COVERAGE = { light: 0.5, medium: 1, heavy: 2 } as const;
type Coverage = keyof typeof INK_COVERAGE;

interface EstimateLine { category: string; description: string; quantity: number; unit: string; unit_cost: number; }

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
function buildEstimate(
  s: {
    quantity: number; width_cm: number; height_cm: number; grammage_gsm: number;
    colors_front: number; colors_back: number; substrate_type: string; finishing: boolean;
    coverage: Coverage;
  },
  catalog: CostCenterItem[],
  materialCost: any[]
) {
  const calcInput = {
    quantity: s.quantity,
    width_cm: s.width_cm,
    height_cm: s.height_cm,
    grammage_gsm: s.grammage_gsm,
    substrate_type: s.substrate_type,
    color_front: COLOR_MODE_BY_COUNT[s.colors_front] ?? 'cmyk',
    color_back: COLOR_MODE_BY_COUNT[s.colors_back] ?? 'sin_impresion',
    finishes: { finish_corte: true, finish_plegado: s.finishing },
  } as unknown as OTFormData;

  // La cobertura del arte multiplica el consumo de tinta: un fondo sólido a
  // full come mucho más que una línea fina, y es el caso que se cotiza barato
  // y se imprime caro.
  const calcs = computeOTCalculations(calcInput, { inkCoverage: s.coverage });
  const impo = computeImposition(s.width_cm, s.height_cm, s.quantity);
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

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-slate-500/15 text-slate-500',
  sent: 'bg-sky-500/15 text-sky-500',
  signed: 'bg-amber-500/15 text-amber-600',
  converted: 'bg-green-500/15 text-green-600',
  rejected: 'bg-red-500/15 text-red-500',
};

function CotizacionesInner() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: vbs = [] } = useVistosBuenos();
  const { data: ots = [] } = useOTs();

  const clients = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of ots as any[]) if (o.client_id) m.set(o.client_id, o.client_name);
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [ots]);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // VB en proceso de firma: pide la imagen aprobada como parte del acto.
  const [signFlow, setSignFlow] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  // Mismas tarifas que producción: catálogo compartido + costo de material
  // ponderado por compras. Si el vendedor cotiza con otros números, el taller
  // factura una cosa y la cotización prometió otra.
  const { data: catalog = [] } = useCostCatalog();
  const { data: materialCost = [] } = useMaterialCost();

  const [form, setForm] = useState({
    client_id: '', product_name: '', quantity: 100000,
    width_cm: 9, height_cm: 12, grammage_gsm: 115,
    colors_front: 4, colors_back: 0, coverage: 'medium' as Coverage, finishing: false,
    substrate_type: 'couche',
    markup: 35,
  });

  const calc = useMemo(() => {
    const { lines, subtotal, calcs, impo } = buildEstimate(form, catalog, materialCost);
    const total = Math.round(subtotal * (1 + form.markup / 100));
    const floor = Math.round(subtotal * 1.10);
    const unit = form.quantity > 0 ? total / form.quantity : 0;
    const marginPct = total > 0 ? Math.round(((total - subtotal) / total) * 100) : 0;
    return { lines, subtotal, total, floor, unit, marginPct, belowFloor: total < floor, calcs, impo };
  }, [form, catalog, materialCost]);

  const save = async () => {
    const client = clients.find((c) => c.id === form.client_id);
    if (!client) { toast.error('Seleccione un cliente'); return; }
    if (calc.belowFloor) { toast.error('El precio está bajo el piso de costo'); return; }
    setSaving(true);
    const res = await fetch('/api/vistos-buenos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: client.id, client_name: client.name,
        product_name: form.product_name || 'Trabajo de impresión',
        product_type: 'etiqueta', quantity: form.quantity,
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
    setSaving(false);
    if (!res.ok) { const b = await res.json().catch(() => null); toast.error(b?.error ?? 'Error al guardar'); return; }
    toast.success('Cotización (Visto Bueno) creada');
    setOpen(false);
    qc.invalidateQueries({ queryKey: ['vistosBuenos'] });
  };

  const setStatus = async (id: string, status: string) => {
    const res = await fetch(`/api/vistos-buenos/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, signed_by_name: status === 'signed' ? 'Cliente' : undefined }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      // Sin imagen no hay firma: el servidor lo exige, la UI abre el paso.
      if (b?.code === 'VB_SIN_IMAGEN') { setSignFlow(id); return; }
      toast.error(b?.error ?? 'No se pudo actualizar');
      return;
    }
    toast.success(status === 'signed' ? 'Visto Bueno firmado' : 'Actualizado');
    setSignFlow(null);
    qc.invalidateQueries({ queryKey: ['vistosBuenos'] });
  };

  /**
   * Firmar = aprobar un visual. El flujo pide la imagen como el acto mismo de
   * la aprobación: se sube anclada al VB (vb_id) y recién entonces se firma.
   * Cuando llegue el reclamo de "me imprimieron el pantone equivocado", esto
   * es lo único que zanja la discusión.
   */
  const signWithImage = async (id: string, file: File) => {
    setSigning(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('vb_id', id);
      const up = await fetch('/api/attachments/upload', { method: 'POST', credentials: 'include', body: fd });
      if (!up.ok) {
        const b = await up.json().catch(() => null);
        throw new Error(b?.error ?? 'No se pudo subir la imagen');
      }
      await setStatus(id, 'signed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo firmar');
    } finally {
      setSigning(false);
    }
  };

  const convert = async (id: string) => {
    const res = await fetch(`/api/vistos-buenos/${id}/convert`, { method: 'POST' });
    const b = await res.json().catch(() => null);
    if (!res.ok) { toast.error(b?.error ?? 'No se pudo generar la OT'); return; }
    toast.success('OT generada con su estimado en el ledger');
    qc.invalidateQueries({ queryKey: ['vistosBuenos'] });
    qc.invalidateQueries({ queryKey: ['ots'] });
    qc.invalidateQueries({ queryKey: ['otCostSummary'] });
    router.push('/operaciones/kanban');
  };

  const num = (v: string) => parseFloat(v) || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{vbs.length} cotizaciones</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Nueva Cotización</Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>Nueva Cotización (Visto Bueno)</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Spec */}
              <div className="space-y-3">
                <div>
                  <Label>Cliente</Label>
                  <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2"
                    value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
                    <option value="">Seleccione…</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div><Label>Producto</Label><Input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} placeholder="Ej: Etiqueta frasco 250ml" /></div>
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
                  <div><Label className="text-xs">Colores frente</Label><Input type="number" value={form.colors_front} onChange={(e) => setForm({ ...form, colors_front: num(e.target.value) })} /></div>
                  <div><Label className="text-xs">Colores dorso</Label><Input type="number" value={form.colors_back} onChange={(e) => setForm({ ...form, colors_back: num(e.target.value) })} /></div>
                </div>
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
                  <label className="flex items-center gap-2 text-sm pb-2">
                    <input type="checkbox" checked={form.finishing} onChange={(e) => setForm({ ...form, finishing: e.target.checked })} />
                    Terminaciones
                  </label>
                </div>
              </div>

              {/* Estimate + pricing */}
              <div className="space-y-3">
                {/* El papel es la línea más cara de casi todo trabajo: el vendedor
                    tiene que ver QUÉ y CUÁNTO antes de comprometer un precio. */}
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-primary">Papel que requiere</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    <span className="text-muted-foreground">Pliegos a comprar</span>
                    <span className="text-right font-semibold tabular-nums text-foreground">
                      {calc.calcs.calc_sheets.toLocaleString('es-CL')}
                    </span>
                    <span className="text-muted-foreground">Formato</span>
                    <span className="text-right tabular-nums text-foreground">
                      {calc.impo.format_label ?? '—'}
                    </span>
                    <span className="text-muted-foreground">Poses por pliego</span>
                    <span className="text-right tabular-nums text-foreground">
                      {calc.impo.poses_per_sheet}
                    </span>
                    <span className="text-muted-foreground">Kilos de sustrato</span>
                    <span className="text-right tabular-nums text-foreground">
                      {calc.calcs.calc_substrate_kg.toFixed(1)} kg
                    </span>
                    <span className="text-muted-foreground">Planchas · horas prensa</span>
                    <span className="text-right tabular-nums text-foreground">
                      {calc.calcs.calc_plates} · {calc.calcs.calc_print_hours.toFixed(1)} h
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Incluye merma y alistamiento. Mismo motor que usa producción, así que lo
                    cotizado es lo que el taller va a consumir.
                  </p>
                </div>

                <div className="rounded-md border border-border p-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Costo estimado</p>
                  <div className="space-y-1 text-sm">
                    {calc.lines.map((l, i) => (
                      <div key={i} className="flex justify-between gap-2">
                        <span className="truncate text-muted-foreground">{l.description}</span>
                        <span className="tabular-nums">{formatCLP(l.quantity * l.unit_cost)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t border-border pt-1 font-semibold">
                      <span>Subtotal costo</span><span>{formatCLP(calc.subtotal)}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Markup: {form.markup}%</Label>
                  <input type="range" min={5} max={120} value={form.markup}
                    onChange={(e) => setForm({ ...form, markup: num(e.target.value) })} className="w-full" />
                </div>
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Precio total</span><span className="text-xl font-bold text-primary">{formatCLP(calc.total)}</span></div>
                  <div className="flex justify-between text-xs text-muted-foreground"><span>Unitario</span><span>{formatCLP(calc.unit)}</span></div>
                  <div className="flex justify-between text-xs text-muted-foreground"><span>Margen</span><span>{calc.marginPct}%</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Piso de costo</span><span className={calc.belowFloor ? 'text-red-500 font-semibold' : 'text-muted-foreground'}>{formatCLP(calc.floor)}</span></div>
                  {calc.belowFloor && <p className="text-xs text-red-500">⚠️ Precio bajo el piso — sube el markup.</p>}
                </div>
                <Button className="w-full" onClick={save} disabled={saving || calc.belowFloor}>{saving ? 'Guardando…' : 'Guardar cotización'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Cotizaciones</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium">N°</th>
                  <th className="text-left py-2 px-3 font-medium">Cliente</th>
                  <th className="text-left py-2 px-3 font-medium">Producto</th>
                  <th className="text-right py-2 px-3 font-medium">Total</th>
                  <th className="text-center py-2 px-3 font-medium">Estado</th>
                  <th className="text-right py-2 px-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {vbs.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">Sin cotizaciones — crea la primera.</td></tr>}
                {vbs.map((vb) => (
                  <tr key={vb.id} className="border-b hover:bg-muted/40">
                    <td className="py-2 px-3 font-mono text-xs">{vb.vb_number}</td>
                    <td className="py-2 px-3">{vb.client_name}</td>
                    <td className="py-2 px-3 text-muted-foreground truncate max-w-[200px]">{vb.product_name}</td>
                    <td className="py-2 px-3 text-right font-semibold">{formatCLP(vb.total_price)}</td>
                    <td className="py-2 px-3 text-center"><Badge className={STATUS_BADGE[vb.status] ?? ''}>{vb.status}</Badge></td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      {(vb.status === 'draft' || vb.status === 'sent') && signFlow !== vb.id && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setStatus(vb.id, 'signed')}>
                          <PenLine className="h-3 w-3 mr-1" /> Marcar firmada
                        </Button>
                      )}
                      {signFlow === vb.id && (
                        <span className="inline-flex items-center gap-2">
                          <label className={`inline-flex h-7 cursor-pointer items-center rounded-md border border-amber-500/50 bg-amber-500/10 px-2 text-xs font-medium text-amber-700 dark:text-amber-400 ${signing ? 'opacity-50 pointer-events-none' : ''}`}>
                            {signing ? 'Subiendo…' : '¿Qué aprueba el cliente? Subir imagen'}
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/svg+xml,image/tiff,application/pdf"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) signWithImage(vb.id, f);
                              }}
                            />
                          </label>
                          <button className="text-xs text-muted-foreground hover:underline" onClick={() => setSignFlow(null)}>
                            Cancelar
                          </button>
                        </span>
                      )}
                      {vb.status === 'signed' && (
                        <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => convert(vb.id)}>
                          Generar OT <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      )}
                      {vb.status === 'converted' && <span className="text-xs text-green-600">OT generada ✓</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
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
            <p className="text-sm text-muted-foreground mt-0.5">Construye un Visto Bueno con estimación de costos y, al firmarse, genéralo como OT.</p>
          </div>
        </div>
        <CotizacionesInner />
      </div>
    </ProtectedRoute>
  );
}
