'use client';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Receipt, FileText, Link2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatCLP } from '@/lib/format';
import { usePurchases } from '@/hooks/use-admin-queries';
import { useOTs } from '@/hooks/use-operations-queries';
import {
  usePurchaseInvoices, useCreateOC, useCreateFactura, useUpdateFactura,
  type OCRow, type FacturaCompra,
} from '@/hooks/use-procurement-queries';

const OC_STATUS: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Borrador',  cls: 'bg-slate-500/15 text-slate-500' },
  sent:      { label: 'Enviada',   cls: 'bg-sky-500/15 text-sky-600' },
  received:  { label: 'Recibida',  cls: 'bg-indigo-500/15 text-indigo-600' },
  invoiced:  { label: 'Facturada', cls: 'bg-amber-500/15 text-amber-600' },
  closed:    { label: 'Cerrada',   cls: 'bg-green-500/15 text-green-600' },
  cancelled: { label: 'Anulada',   cls: 'bg-red-500/15 text-red-600' },
};
const FACTURA_STATUS: Record<string, { label: string; cls: string }> = {
  received: { label: 'Recibida',   cls: 'bg-slate-500/15 text-slate-500' },
  matched:  { label: 'Conciliada', cls: 'bg-green-500/15 text-green-600' },
  disputed: { label: 'En disputa', cls: 'bg-red-500/15 text-red-600' },
  paid:     { label: 'Pagada',     cls: 'bg-emerald-500/15 text-emerald-600' },
};

const PurchasesManagement = () => {
  const { data: ocs = [] } = usePurchases() as { data: OCRow[] };
  const { data: ots = [] } = useOTs();
  const createOC = useCreateOC();

  const [showNew, setShowNew] = useState(false);
  const [facturasFor, setFacturasFor] = useState<OCRow | null>(null);
  const [form, setForm] = useState({
    supplier: '', supplier_rut: '', ot_id: '', total_cost: 0,
    expected_date: '', certification_details: '', notes: '',
  });

  const activeOTs = useMemo(
    () => (ots as any[]).filter((o) => o.status !== 'completed'),
    [ots]
  );

  const kpis = useMemo(() => {
    const committed = ocs
      .filter((o) => ['sent', 'received', 'invoiced'].includes(o.status) && o.matched_count === 0 && o.ot_id)
      .reduce((a, o) => a + Number(o.total_cost || 0), 0);
    const invoiced = ocs.reduce((a, o) => a + Number(o.invoiced_total || 0), 0);
    const discrepancies = ocs.filter((o) => o.invoice_count > 0 && Math.abs(Number(o.variance || 0)) > 0).length;
    return { committed, invoiced, discrepancies };
  }, [ocs]);

  const resetForm = () => {
    setForm({ supplier: '', supplier_rut: '', ot_id: '', total_cost: 0, expected_date: '', certification_details: '', notes: '' });
    setShowNew(false);
  };

  const submitOC = async () => {
    if (!form.supplier.trim()) { toast.error('Indica el proveedor'); return; }
    try {
      await createOC.mutateAsync({
        supplier: form.supplier,
        supplier_rut: form.supplier_rut || null,
        ot_id: form.ot_id || null,
        total_cost: Number(form.total_cost) || 0,
        status: 'sent',
        expected_date: form.expected_date || null,
        certification_details: form.certification_details || null,
        notes: form.notes || null,
      });
      toast.success('OC creada — costo comprometido en la OT');
      resetForm();
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo crear la OC');
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-primary">Órdenes de Compra</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            La OC compromete el costo en su OT; al conciliar la factura, pasa a costo real.
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nueva OC
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border bg-card/60 p-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Comprometido (en OT)</p>
            <p className="text-xl font-bold text-sky-600">{formatCLP(kpis.committed)}</p>
          </div>
          <div className="rounded-lg border bg-card/60 p-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Facturado</p>
            <p className="text-xl font-bold text-emerald-600">{formatCLP(kpis.invoiced)}</p>
          </div>
          <div className="rounded-lg border bg-card/60 p-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Con discrepancia</p>
            <p className="text-xl font-bold text-amber-600">{kpis.discrepancies}</p>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>OC</TableHead>
              <TableHead>OT</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Total OC</TableHead>
              <TableHead className="text-right">Facturado</TableHead>
              <TableHead className="text-right">Variación</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ocs.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Sin órdenes de compra.</TableCell></TableRow>
            )}
            {ocs.map((oc) => {
              const st = OC_STATUS[oc.status] ?? { label: oc.status, cls: '' };
              const hasVar = oc.invoice_count > 0 && Math.abs(Number(oc.variance || 0)) > 0;
              return (
                <TableRow key={oc.id}>
                  <TableCell className="font-mono text-xs">{oc.oc_number}</TableCell>
                  <TableCell>
                    {oc.ot_number
                      ? <span className="inline-flex items-center gap-1 text-xs"><Link2 className="h-3 w-3 text-muted-foreground" />{oc.ot_number}</span>
                      : <span className="text-xs text-muted-foreground">Stock</span>}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate">{oc.supplier}</TableCell>
                  <TableCell><Badge className={st.cls}>{st.label}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{formatCLP(oc.total_cost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{oc.invoice_count > 0 ? formatCLP(oc.invoiced_total) : '—'}</TableCell>
                  <TableCell className={`text-right tabular-nums ${hasVar ? (Number(oc.variance) < 0 ? 'text-red-600' : 'text-amber-600') : 'text-muted-foreground'}`}>
                    {oc.invoice_count > 0 ? formatCLP(oc.variance) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => setFacturasFor(oc)}>
                      <Receipt className="h-3.5 w-3.5" /> Facturas {oc.invoice_count > 0 && `(${oc.invoice_count})`}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>

      {/* Nueva OC */}
      <Dialog open={showNew} onOpenChange={(o) => (o ? setShowNew(true) : resetForm())}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Órden de Compra</DialogTitle>
            <DialogDescription>Vincula la compra a una OT para que el costo se refleje en su ledger.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Proveedor</Label>
                <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>RUT proveedor</Label>
                <Input value={form.supplier_rut} onChange={(e) => setForm({ ...form, supplier_rut: e.target.value })} placeholder="76.123.456-7" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>OT vinculada (opcional)</Label>
              <Select value={form.ot_id || 'none'} onValueChange={(v) => setForm({ ...form, ot_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Sin OT (stock)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin OT (stock)</SelectItem>
                  {activeOTs.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>{o.ot_number} — {o.client_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Total OC (CLP)</Label>
                <Input type="number" value={form.total_cost} onChange={(e) => setForm({ ...form, total_cost: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha esperada</Label>
                <Input type="date" value={form.expected_date} onChange={(e) => setForm({ ...form, expected_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Certificación / notas FSSC</Label>
              <Textarea rows={2} value={form.certification_details} onChange={(e) => setForm({ ...form, certification_details: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button onClick={submitOC} disabled={createOC.isPending}>{createOC.isPending ? 'Creando…' : 'Crear OC'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Facturas de una OC */}
      <FacturasDialog oc={facturasFor} onClose={() => setFacturasFor(null)} />
    </Card>
  );
};

// ── Facturas detail + matching ──────────────────────────────────────────────
function FacturasDialog({ oc, onClose }: { oc: OCRow | null; onClose: () => void }) {
  const { data: facturas = [] } = usePurchaseInvoices(oc?.id ?? null);
  const createFactura = useCreateFactura();
  const updateFactura = useUpdateFactura();
  const [num, setNum] = useState('');
  const [amount, setAmount] = useState(0);

  if (!oc) return null;

  const addFactura = async (status: 'received' | 'matched') => {
    if (!num.trim()) { toast.error('N° de factura requerido'); return; }
    try {
      await createFactura.mutateAsync({ purchaseId: oc.id, invoice_number: num, amount: Number(amount) || 0, status });
      toast.success(status === 'matched' ? 'Factura conciliada — costo real en la OT' : 'Factura registrada');
      setNum(''); setAmount(0);
    } catch (e: any) { toast.error(e?.message ?? 'Error'); }
  };

  const setStatus = async (f: FacturaCompra, status: FacturaCompra['status']) => {
    try {
      await updateFactura.mutateAsync({ purchaseId: oc.id, invoiceId: f.id, status });
      toast.success(status === 'matched' || status === 'paid' ? 'Conciliada — costo real en la OT' : 'Actualizada');
    } catch (e: any) { toast.error(e?.message ?? 'Error'); }
  };

  return (
    <Dialog open={!!oc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Facturas — {oc.oc_number}
          </DialogTitle>
          <DialogDescription>
            {oc.supplier} · OC {formatCLP(oc.total_cost)}{oc.ot_number ? ` · ${oc.ot_number}` : ' · stock'}
          </DialogDescription>
        </DialogHeader>

        {/* Existing facturas */}
        <div className="space-y-2">
          {facturas.length === 0 && <p className="text-sm text-muted-foreground py-2">Aún no hay facturas registradas.</p>}
          {facturas.map((f) => {
            const fs = FACTURA_STATUS[f.status] ?? { label: f.status, cls: '' };
            const diff = Number(f.amount) - Number(oc.total_cost);
            return (
              <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{f.invoice_number}</span>
                    <Badge className={fs.cls}>{fs.label}</Badge>
                    {diff !== 0 && (
                      <span className={`inline-flex items-center gap-1 text-xs ${diff > 0 ? 'text-red-600' : 'text-amber-600'}`}>
                        <AlertTriangle className="h-3 w-3" /> {diff > 0 ? '+' : ''}{formatCLP(diff)} vs OC
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold tabular-nums mt-0.5">{formatCLP(f.amount)}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {f.status !== 'matched' && f.status !== 'paid' && (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setStatus(f, 'matched')}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Conciliar
                    </Button>
                  )}
                  {(f.status === 'matched') && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(f, 'paid')}>Marcar pagada</Button>
                  )}
                  {f.status !== 'disputed' && f.status !== 'paid' && (
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setStatus(f, 'disputed')}>Disputar</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* New factura */}
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          <p className="text-sm font-medium">Registrar factura</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>N° factura (DTE)</Label>
              <Input value={num} onChange={(e) => setNum(e.target.value)} placeholder="F-12345" />
            </div>
            <div className="space-y-1.5">
              <Label>Monto (CLP)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => addFactura('received')} disabled={createFactura.isPending}>Registrar</Button>
            <Button onClick={() => addFactura('matched')} disabled={createFactura.isPending}>Registrar y conciliar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PurchasesManagement;
