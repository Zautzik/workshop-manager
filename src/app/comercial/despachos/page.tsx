'use client';
import { useMemo, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Truck, FileText, CheckCircle2, PackageCheck, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { formatCLP } from '@/lib/format';
import {
  useFulfillment, useDispatchGuides, useSalesInvoices,
  useCreateGuide, useUpdateGuide, useCreateInvoice, useUpdateInvoice,
  type OTFulfillment, type DispatchGuide,
} from '@/hooks/use-dispatch-queries';

const GUIDE_STATUS: Record<string, { label: string; cls: string }> = {
  draft:      { label: 'Borrador',  cls: 'bg-slate-500/15 text-slate-500' },
  dispatched: { label: 'Despachada',cls: 'bg-teal-500/15 text-teal-600' },
  delivered:  { label: 'Entregada', cls: 'bg-green-500/15 text-green-600' },
  cancelled:  { label: 'Anulada',   cls: 'bg-red-500/15 text-red-600' },
};
const INVOICE_STATUS: Record<string, { label: string; cls: string }> = {
  issued:    { label: 'Emitida',  cls: 'bg-sky-500/15 text-sky-600' },
  sent:      { label: 'Enviada',  cls: 'bg-indigo-500/15 text-indigo-600' },
  paid:      { label: 'Pagada',   cls: 'bg-emerald-500/15 text-emerald-600' },
  cancelled: { label: 'Anulada',  cls: 'bg-red-500/15 text-red-600' },
};

function DespachosInner() {
  const { data: rows = [] } = useFulfillment('dispatch');
  const [manage, setManage] = useState<OTFulfillment | null>(null);

  const kpis = useMemo(() => {
    const pendientes = rows.filter((r) => r.dispatched_pct < 100).length;
    const facturado = rows.reduce((a, r) => a + Number(r.invoiced_total || 0), 0);
    const cobrado = rows.reduce((a, r) => a + Number(r.paid_total || 0), 0);
    const porCobrar = facturado - cobrado;
    return { pendientes, facturado, cobrado, porCobrar };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Por despachar" value={String(kpis.pendientes)} hint="OT con saldo pendiente" tint="text-teal-600" />
        <KpiCard label="Facturado" value={formatCLP(kpis.facturado)} hint="facturas de venta emitidas" tint="text-sky-600" />
        <KpiCard label="Cobrado" value={formatCLP(kpis.cobrado)} hint="facturas pagadas" tint="text-emerald-600" />
        <KpiCard label="Por cobrar" value={formatCLP(kpis.porCobrar)} hint="emitido − pagado" tint="text-amber-600" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">OT en despacho</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-muted-foreground">
                <th className="text-left py-2 px-2 font-medium">OT</th>
                <th className="text-left py-2 px-2 font-medium">Cliente</th>
                <th className="text-left py-2 px-2 font-medium w-[28%]">Avance despacho</th>
                <th className="text-right py-2 px-2 font-medium">Cotizado</th>
                <th className="text-right py-2 px-2 font-medium">Facturado</th>
                <th className="text-right py-2 px-2 font-medium"></th>
              </tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={6} className="text-center text-muted-foreground py-8">Sin OT en fase de despacho.</td></tr>}
                {rows.map((r) => (
                  <tr key={r.ot_id} className="border-b hover:bg-muted/40">
                    <td className="py-2 px-2 font-mono text-xs">{r.ot_number}</td>
                    <td className="py-2 px-2 max-w-[160px] truncate">{r.client_name}</td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        <Progress value={Math.min(100, r.dispatched_pct)} className="h-2 flex-1" />
                        <span className="text-xs tabular-nums w-24 text-right text-muted-foreground">
                          {r.dispatched_qty.toLocaleString('es-CL')}/{r.ordered_qty.toLocaleString('es-CL')}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{formatCLP(r.quoted_price)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.invoiced_total > 0 ? formatCLP(r.invoiced_total) : '—'}</td>
                    <td className="py-2 px-2 text-right">
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => setManage(r)}>
                        <Truck className="h-3.5 w-3.5" /> Gestionar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ManageDialog ot={manage} onClose={() => setManage(null)} />
    </div>
  );
}

function KpiCard({ label, value, hint, tint }: { label: string; value: string; hint: string; tint: string }) {
  return (
    <div className="rounded-lg border bg-card/60 p-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${tint}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
    </div>
  );
}

// ── Per-OT dispatch + billing management ────────────────────────────────────
function ManageDialog({ ot, onClose }: { ot: OTFulfillment | null; onClose: () => void }) {
  const otId = ot?.ot_id ?? null;
  const { data: guides = [] } = useDispatchGuides(otId);
  const { data: invoices = [] } = useSalesInvoices(otId);
  const createGuide = useCreateGuide(otId);
  const updateGuide = useUpdateGuide(otId);
  const createInvoice = useCreateInvoice(otId);
  const updateInvoice = useUpdateInvoice(otId);

  const remaining = ot ? Math.max(0, ot.ordered_qty - ot.dispatched_qty) : 0;
  const [qty, setQty] = useState<number>(0);
  const [carrier, setCarrier] = useState('');
  const [plate, setPlate] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  if (!ot) return null;

  const unitNet = ot.ordered_qty > 0 ? ot.quoted_price / ot.ordered_qty : 0;
  const unbilled = guides.filter((g) => !g.invoice_id && g.status !== 'cancelled');
  const selectedGuides = unbilled.filter((g) => selected[g.id]);
  const invoiceNet = Math.round(selectedGuides.reduce((a, g) => a + g.quantity, 0) * unitNet);
  const invoiceTax = Math.round(invoiceNet * 0.19);

  const addGuide = async () => {
    const q = qty || remaining;
    if (q <= 0) { toast.error('Cantidad inválida'); return; }
    try {
      await createGuide.mutateAsync({
        ot_id: ot.ot_id, client_name: ot.client_name, quantity: q,
        carrier: carrier || null, vehicle_plate: plate || null,
      });
      toast.success(`Guía creada — ${q.toLocaleString('es-CL')} u. despachadas`);
      setQty(0); setCarrier(''); setPlate('');
    } catch (e: any) { toast.error(e?.message ?? 'Error'); }
  };

  const issueInvoice = async () => {
    if (selectedGuides.length === 0) { toast.error('Selecciona al menos una guía'); return; }
    try {
      await createInvoice.mutateAsync({
        ot_id: ot.ot_id, client_id: null, client_name: ot.client_name,
        net_amount: invoiceNet, guide_ids: selectedGuides.map((g) => g.id),
      });
      toast.success('Factura de venta emitida');
      setSelected({});
    } catch (e: any) { toast.error(e?.message ?? 'Error'); }
  };

  const markGuide = async (g: DispatchGuide, status: DispatchGuide['status']) => {
    try { await updateGuide.mutateAsync({ id: g.id, status }); } catch (e: any) { toast.error(e?.message ?? 'Error'); }
  };

  return (
    <Dialog open={!!ot} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PackageCheck className="h-5 w-5" /> {ot.ot_number} — {ot.client_name}</DialogTitle>
          <DialogDescription>
            Despachado {ot.dispatched_qty.toLocaleString('es-CL')} de {ot.ordered_qty.toLocaleString('es-CL')} u. ·
            cotizado {formatCLP(ot.quoted_price)} · facturado {formatCLP(ot.invoiced_total)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-5">
          {/* Guías */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Truck className="h-4 w-4" /> Guías de despacho</h3>
            <div className="space-y-2">
              {guides.length === 0 && <p className="text-xs text-muted-foreground">Sin guías aún.</p>}
              {guides.map((g) => {
                const gs = GUIDE_STATUS[g.status] ?? { label: g.status, cls: '' };
                return (
                  <div key={g.id} className="rounded-lg border p-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs">{g.guide_number}</span>
                      <Badge className={gs.cls}>{gs.label}</Badge>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-muted-foreground text-xs">
                      <span>{g.quantity.toLocaleString('es-CL')} u.{g.invoice_id ? ' · facturada' : ''}</span>
                      {g.status === 'dispatched' && (
                        <button className="text-green-600 hover:underline" onClick={() => markGuide(g, 'delivered')}>Marcar entregada</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Nueva guía */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-medium">Nueva guía {remaining > 0 && <span className="text-muted-foreground">(saldo {remaining.toLocaleString('es-CL')} u.)</span>}</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Cantidad</Label>
                  <Input type="number" value={qty || ''} placeholder={String(remaining)} onChange={(e) => setQty(parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Transportista</Label>
                  <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Patente</Label>
                  <Input value={plate} onChange={(e) => setPlate(e.target.value)} />
                </div>
              </div>
              <Button size="sm" className="w-full" onClick={addGuide} disabled={createGuide.isPending}>Crear guía</Button>
            </div>
          </div>

          {/* Facturas */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Receipt className="h-4 w-4" /> Facturas de venta</h3>
            <div className="space-y-2">
              {invoices.length === 0 && <p className="text-xs text-muted-foreground">Sin facturas aún.</p>}
              {invoices.map((inv) => {
                const is = INVOICE_STATUS[inv.status] ?? { label: inv.status, cls: '' };
                return (
                  <div key={inv.id} className="rounded-lg border p-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs">{inv.invoice_number}</span>
                      <Badge className={is.cls}>{is.label}</Badge>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground">neto {formatCLP(inv.net_amount)} · IVA {formatCLP(inv.tax_amount)}</span>
                      <span className="font-semibold tabular-nums">{formatCLP(inv.total_amount)}</span>
                    </div>
                    {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                      <button className="mt-1 text-xs text-emerald-600 hover:underline inline-flex items-center gap-1"
                        onClick={() => updateInvoice.mutate({ id: inv.id, status: 'paid' })}>
                        <CheckCircle2 className="h-3 w-3" /> Marcar pagada
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Nueva factura desde guías no facturadas */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-medium flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> Facturar guías</p>
              {unbilled.length === 0 && <p className="text-xs text-muted-foreground">No hay guías sin facturar.</p>}
              {unbilled.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={!!selected[g.id]} onCheckedChange={(c) => setSelected((s) => ({ ...s, [g.id]: !!c }))} />
                  <span className="font-mono">{g.guide_number}</span>
                  <span className="text-muted-foreground">{g.quantity.toLocaleString('es-CL')} u. · {formatCLP(Math.round(g.quantity * unitNet))}</span>
                </label>
              ))}
              {selectedGuides.length > 0 && (
                <div className="text-xs text-muted-foreground border-t pt-2">
                  Neto {formatCLP(invoiceNet)} + IVA {formatCLP(invoiceTax)} = <span className="font-semibold text-foreground">{formatCLP(invoiceNet + invoiceTax)}</span>
                </div>
              )}
              <Button size="sm" className="w-full" onClick={issueInvoice} disabled={createInvoice.isPending || selectedGuides.length === 0}>
                Emitir factura de venta
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DespachosPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'manager', 'supervisor']}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Despachos & Facturación</h1>
          <p className="text-sm text-muted-foreground mt-1">Guía de despacho → factura de venta, con entregas parciales por OT.</p>
        </div>
        <DespachosInner />
      </div>
    </ProtectedRoute>
  );
}
