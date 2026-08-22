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
import { QRCodeSVG } from 'qrcode.react';
import { Plus, Trash2, Receipt, FileText, Link2, AlertTriangle, CheckCircle2, PackageCheck, FileSignature, Ban, ShieldAlert } from 'lucide-react';
import { formatCLP } from '@/lib/format';
import { ocActions, threeWayMatch, type OCStatus } from '@/lib/purchasing';
import { usePurchases } from '@/hooks/use-admin-queries';
import { useOTs } from '@/hooks/use-operations-queries';
import {
  usePurchaseInvoices, useCreateOC, useCreateFactura, useUpdateFactura,
  useStockItems, useReceiveOC, usePurchaseOrder,
  type OCRow, type FacturaCompra, type StockItem, type PurchaseOrderLine,
} from '@/hooks/use-procurement-queries';

interface DraftLine {
  key: number;
  item_id: string;
  quantity: number;
  unit_cost: number;
}

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
  const { data: ocs = [], refetch } = usePurchases() as { data: OCRow[]; refetch: () => void };
  const { data: ots = [] } = useOTs();
  const createOC = useCreateOC();

  const [showNew, setShowNew] = useState(false);
  const [facturasFor, setFacturasFor] = useState<OCRow | null>(null);
  const [receiveFor, setReceiveFor] = useState<OCRow | null>(null);

  /**
   * Emitir: el acto que convierte un borrador en documento.
   *
   * El número lo asigna la base dentro de la transacción y no esta pantalla. Si
   * lo calculara acá —leer el último y sumar uno— dos pestañas abiertas
   * emitirían el mismo, y una numeración con duplicados es tan indefendible
   * frente a una auditoría como una con huecos.
   */
  const emitirOC = async (oc: OCRow) => {
    const res = await fetch(`/api/purchases/${oc.id}/issue`, { method: 'POST' });
    const b = await res.json().catch(() => null);
    if (!res.ok) { toast.error(b?.error ?? 'No se pudo emitir'); return; }
    toast.success(b.mensaje);
    refetch();
  };

  /**
   * Anular conserva el número. No hay borrado.
   *
   * Una OC emitida existió y comprometió plata con un proveedor; hacerla
   * desaparecer deja un hueco en el correlativo, que es lo primero que mira una
   * auditoría y lo más difícil de explicar. Por eso se exige motivo.
   */
  const anularOC = async (oc: OCRow) => {
    const motivo = window.prompt(
      `Anular ${oc.oc_number}. El número se conserva.\n\n¿Por qué se anula? (mínimo 10 caracteres)`
    );
    if (!motivo) return;
    const res = await fetch(`/api/purchases/${oc.id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: motivo }),
    });
    const b = await res.json().catch(() => null);
    if (!res.ok) { toast.error(b?.error ?? 'No se pudo anular'); return; }
    toast.success(b.mensaje);
    refetch();
  };
  const [form, setForm] = useState({
    supplier: '', supplier_rut: '', ot_id: '', total_cost: 0,
    expected_date: '', certification_details: '', notes: '',
  });
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [lineSeq, setLineSeq] = useState(0);
  const { data: stockItems = [] } = useStockItems();

  const addLine = () => {
    setLines((ls) => [...ls, { key: lineSeq, item_id: '', quantity: 0, unit_cost: 0 }]);
    setLineSeq((n) => n + 1);
  };
  const updateLine = (key: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: number) => setLines((ls) => ls.filter((l) => l.key !== key));

  const linesTotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.quantity * l.unit_cost, 0),
    [lines]
  );

  const activeOTs = useMemo(
    () => (ots as any[]).filter((o) => o.status !== 'completed'),
    [ots]
  );

  const kpis = useMemo(() => {
    const committed = ocs
      .filter((o) => ['sent', 'received', 'invoiced'].includes(o.status) && o.matched_count === 0 && o.ot_id)
      .reduce((a, o) => a + Number(o.total_cost || 0), 0);
    const invoiced = ocs.reduce((a, o) => a + Number(o.facturado ?? o.invoiced_total ?? 0), 0);

    // El contador de discrepancias miraba `variance` —pedido menos facturado— y
    // por eso NO veía el caso peor: pedir 500, recibir 480 y que te facturen
    // 500 da variación cero. El titular de la pantalla decía «todo en orden»
    // justo cuando el proveedor cobra papel que no entregó.
    const conDiferencia = ocs.filter(
      (o) =>
        threeWayMatch({
          ordered: Number(o.pedido ?? o.total_cost ?? 0),
          received: Number(o.recibido ?? 0),
          invoiced: Number(o.facturado ?? 0),
        }).status === 'con_diferencia',
    ).length;

    // El certificado vencido no es plata y por eso se cuenta aparte: una OC
    // puede calzar al peso y traer material que no debería estar en planta.
    const certVencidos = ocs.filter((o) => Number(o.certificados_vencidos ?? 0) > 0).length;

    return { committed, invoiced, discrepancies: conDiferencia, certVencidos };
  }, [ocs]);

  const resetForm = () => {
    setForm({ supplier: '', supplier_rut: '', ot_id: '', total_cost: 0, expected_date: '', certification_details: '', notes: '' });
    setLines([]);
    setShowNew(false);
  };

  const submitOC = async () => {
    if (!form.supplier.trim()) { toast.error('Indica el proveedor'); return; }
    const validLines = lines.filter((l) => l.item_id && l.quantity > 0);
    if (lines.length > 0 && validLines.length !== lines.length) {
      toast.error('Cada línea necesita material y cantidad');
      return;
    }
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
        ...(validLines.length > 0
          ? { items: validLines.map((l) => ({ item_id: l.item_id, quantity: l.quantity, unit_cost: l.unit_cost || null })) }
          : {}),
      });
      toast.success(
        validLines.length > 0
          ? `OC creada con ${validLines.length} línea${validLines.length === 1 ? '' : 's'} — costo comprometido en la OT`
          : 'OC creada — costo comprometido en la OT'
      );
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border bg-card/60 p-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Comprometido (en OT)</p>
            <p className="text-xl font-bold text-sky-600">{formatCLP(kpis.committed)}</p>
          </div>
          <div className="rounded-lg border bg-card/60 p-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Facturado</p>
            <p className="text-xl font-bold text-emerald-600">{formatCLP(kpis.invoiced)}</p>
          </div>
          <div className="rounded-lg border bg-card/60 p-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Cobran de más</p>
            <p className="text-xl font-bold text-amber-600">{kpis.discrepancies}</p>
          </div>
          <div className="rounded-lg border bg-card/60 p-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Certificado vencido</p>
            <p className={`text-xl font-bold ${kpis.certVencidos > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
              {kpis.certVencidos}
            </p>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>OC</TableHead>
              <TableHead>OT</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Estado</TableHead>
              {/* El calce a tres bandas, en tres columnas contiguas. Ver
                  «pedido» y «facturado» sin «recibido» en el medio es lo que
                  deja pasar el caso caro: llegan 480 y facturan 500. */}
              <TableHead className="text-right">Pedido</TableHead>
              <TableHead className="text-right">Recibido</TableHead>
              <TableHead className="text-right">Facturado</TableHead>
              <TableHead className="text-right">Brechas</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ocs.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Sin órdenes de compra.</TableCell></TableRow>
            )}
            {ocs.map((oc) => {
              const st = OC_STATUS[oc.status] ?? { label: oc.status, cls: '' };
              // Las dos brechas se evalúan por separado a propósito: una la
              // resuelve bodega y la otra cuentas por pagar, y su suma puede dar
              // cero teniendo los dos problemas.
              const calce = threeWayMatch({
                ordered: Number(oc.pedido ?? oc.total_cost ?? 0),
                received: Number(oc.recibido ?? 0),
                invoiced: Number(oc.facturado ?? 0),
              });
              const acciones = ocActions(oc.status as OCStatus);
              return (
                <TableRow key={oc.id}>
                  <TableCell className="font-mono text-xs">
                    <div className="flex items-center gap-1.5">
                      {/* Un borrador todavía no tiene número: no gastó correlativo
                          porque todavía no es un documento. */}
                      {oc.oc_number ?? <span className="italic text-muted-foreground">borrador</span>}
                      {/* El certificado vencido no es un problema de plata y por
                          eso no puede vivir en la columna de brechas: una OC
                          puede calzar al peso y traer material que no debería
                          haber entrado. Va al lado del número, que es donde
                          empieza a mirar una auditoría. */}
                      {Number(oc.certificados_vencidos ?? 0) > 0 && (
                        <span
                          title="Tiene lotes recibidos con el certificado vencido"
                          className="inline-flex items-center gap-0.5 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400"
                        >
                          <ShieldAlert className="h-3 w-3" />
                          cert
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {oc.ot_number
                      ? <span className="inline-flex items-center gap-1 text-xs"><Link2 className="h-3 w-3 text-muted-foreground" />{oc.ot_number}</span>
                      : <span className="text-xs text-muted-foreground">Stock</span>}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate">{oc.supplier}</TableCell>
                  <TableCell><Badge className={st.cls}>{st.label}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{formatCLP(Number(oc.pedido ?? oc.total_cost ?? 0))}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(oc.recibido ?? 0) > 0 ? formatCLP(Number(oc.recibido)) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(oc.facturado ?? 0) > 0 ? formatCLP(Number(oc.facturado)) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    {calce.status === 'ok' ? (
                      <span className="text-xs text-muted-foreground">calza</span>
                    ) : (
                      // El hallazgo entero al pasar el mouse: «no cuadra» no es
                      // accionable, «cobran $20.000 más de lo que llegó» sí.
                      <span
                        title={calce.findings.join(' · ')}
                        className={`inline-flex items-center gap-1 text-xs font-medium ${
                          calce.status === 'con_diferencia'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {calce.billingGap < 0
                          ? `cobran ${formatCLP(-calce.billingGap)} de más`
                          : calce.receiptGap !== 0
                            ? `faltan ${formatCLP(Math.abs(calce.receiptGap))} por recibir`
                            : `falta facturar ${formatCLP(calce.billingGap)}`}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {/* Emitir es lo que convierte el borrador en documento:
                          toma el correlativo y se cierra a edición. */}
                      {acciones.emitir && (
                        <Button size="sm" className="gap-1" onClick={() => emitirOC(oc)}>
                          <FileSignature className="h-3.5 w-3.5" /> Emitir
                        </Button>
                      )}
                      {acciones.recibir && (
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => setReceiveFor(oc)}>
                          <PackageCheck className="h-3.5 w-3.5" /> Recibir
                        </Button>
                      )}
                      {/* Anular es legítimo pero no es la acción del día: como
                          botón con texto en cada fila, doscientas copias tapan
                          lo que sí hay que hacer. Queda como icono. */}
                      {acciones.anular && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600"
                          title="Anular la OC (conserva el número)"
                          aria-label={`Anular ${oc.oc_number ?? 'la orden'}`}
                          onClick={() => anularOC(oc)}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => setFacturasFor(oc)}>
                        <Receipt className="h-3.5 w-3.5" /> Facturas {oc.invoice_count > 0 && `(${oc.invoice_count})`}
                      </Button>
                    </div>
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
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Líneas (opcional — qué se pidió, material por material)</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={addLine}>
                  <Plus className="h-3 w-3" /> Agregar línea
                </Button>
              </div>
              {lines.length > 0 && (
                <div className="space-y-1.5 rounded-lg border p-2">
                  {lines.map((l) => (
                    <div key={l.key} className="flex items-center gap-1.5">
                      <Select value={l.item_id} onValueChange={(v) => updateLine(l.key, { item_id: v })}>
                        <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="Material…" /></SelectTrigger>
                        <SelectContent>
                          {stockItems.map((it: StockItem) => (
                            <SelectItem key={it.id} value={it.id}>{it.name} ({it.sku})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number" placeholder="Cant." className="h-8 w-20 text-xs"
                        value={l.quantity || ''}
                        onChange={(e) => updateLine(l.key, { quantity: parseFloat(e.target.value) || 0 })}
                      />
                      <Input
                        type="number" placeholder="$/unid." className="h-8 w-24 text-xs"
                        value={l.unit_cost || ''}
                        onChange={(e) => updateLine(l.key, { unit_cost: parseFloat(e.target.value) || 0 })}
                      />
                      <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {formatCLP(l.quantity * l.unit_cost)}
                      </span>
                      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600" onClick={() => removeLine(l.key)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex justify-end pt-1 text-xs font-medium">
                    Total líneas: <span className="ml-1 tabular-nums">{formatCLP(linesTotal)}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{lines.length > 0 ? 'Total OC (de las líneas)' : 'Total OC (CLP)'}</Label>
                <Input
                  type="number"
                  value={lines.length > 0 ? linesTotal : form.total_cost}
                  disabled={lines.length > 0}
                  onChange={(e) => setForm({ ...form, total_cost: parseFloat(e.target.value) || 0 })}
                />
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

      {/* Recepción de mercadería contra OC */}
      <ReceiveDialog oc={receiveFor} onClose={() => setReceiveFor(null)} />
    </Card>
  );
};

// ── Goods receipt against an OC (creates a lot linked to the OC) ─────────────
function ReceiveDialog({ oc, onClose }: { oc: OCRow | null; onClose: () => void }) {
  const { data: items = [] } = useStockItems();
  const { data: detail } = usePurchaseOrder(oc?.id ?? null);
  const receive = useReceiveOC();
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState(0);
  const [unitCost, setUnitCost] = useState(0);
  const [lotNumber, setLotNumber] = useState('');
  const [certCode, setCertCode] = useState('');

  const openLines = (detail?.items ?? []).filter((l) => l.remaining > 0);

  const recibirLinea = (l: PurchaseOrderLine) => {
    setItemId(l.item_id);
    setQty(l.remaining);
    setUnitCost(l.unit_cost ?? 0);
  };

  if (!oc) return null;

  const submit = async () => {
    if (!itemId) { toast.error('Selecciona el material recibido'); return; }
    if (qty <= 0) { toast.error('Cantidad inválida'); return; }
    try {
      await receive.mutateAsync({
        purchaseId: oc.id, item_id: itemId, quantity: qty,
        unit_cost: unitCost || null, lot_number: lotNumber || null, cert_code: certCode || null,
      });
      toast.success('Recibido — lote creado y vinculado a la OC');
      setItemId(''); setQty(0); setUnitCost(0); setLotNumber(''); setCertCode('');
      onClose();
    } catch (e: any) { toast.error(e?.message ?? 'No se pudo recibir'); }
  };

  return (
    <Dialog open={!!oc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PackageCheck className="h-5 w-5" /> Recibir — {oc.oc_number}</DialogTitle>
          <DialogDescription>{oc.supplier}{oc.ot_number ? ` · ${oc.ot_number}` : ' · stock'} · crea un lote trazable (FSSC) vinculado a la OC.</DialogDescription>
        </DialogHeader>
        {openLines.length > 0 && (
          <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2">
            <p className="text-xs font-medium text-muted-foreground">Pendiente de recibir</p>
            {openLines.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => recibirLinea(l)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
              >
                <span className="truncate">{l.item_name ?? l.item_id} {l.item_sku ? `(${l.item_sku})` : ''}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {l.received_quantity > 0 && `${l.received_quantity.toLocaleString('es-CL')} de `}
                  {l.quantity.toLocaleString('es-CL')} {l.unit ?? ''} · faltan {l.remaining.toLocaleString('es-CL')}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-4">
          <div className="flex-1 space-y-3">
            <div className="space-y-1.5">
              <Label>Material recibido</Label>
              <Select value={itemId} onValueChange={setItemId}>
                <SelectTrigger><SelectValue placeholder="Selecciona material…" /></SelectTrigger>
                <SelectContent>
                  {items.map((it) => (
                    <SelectItem key={it.id} value={it.id}>{it.name} ({it.sku})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cantidad</Label>
                <Input type="number" value={qty || ''} onChange={(e) => setQty(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label>Costo unitario</Label>
                <Input type="number" value={unitCost || ''} onChange={(e) => setUnitCost(parseFloat(e.target.value) || 0)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>N° lote (opcional)</Label>
                <Input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} placeholder="auto" />
              </div>
              <div className="space-y-1.5">
                <Label>Cert. FSSC (opcional)</Label>
                <Input value={certCode} onChange={(e) => setCertCode(e.target.value)} />
              </div>
            </div>
          </div>
          {/* Scannable OC label — operator scans + reporta por WhatsApp */}
          <div className="flex flex-col items-center justify-start gap-1.5 pt-6">
            <div className="rounded-lg border bg-white p-2">
              <QRCodeSVG value={`WH:RECV:OC:${oc.oc_number}`} size={92} />
            </div>
            <span className="text-[10px] text-muted-foreground">{oc.oc_number}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={receive.isPending}>{receive.isPending ? 'Recibiendo…' : 'Confirmar recepción'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
