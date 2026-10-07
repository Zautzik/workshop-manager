'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatCLP } from '@/lib/format';
import { ocActions, type OCStatus } from '@/lib/purchasing';
import {
  usePurchaseInvoices, useCreateFactura, useUpdateFactura,
  type OCRow, type FacturaCompra,
} from '@/hooks/use-procurement-queries';
import { OC_STATUS, FACTURA_STATUS } from './purchase-status';

// ── Facturas detail + matching ──────────────────────────────────────────────
export function FacturasDialog({ oc, onClose }: { oc: OCRow | null; onClose: () => void }) {
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

  const setStatus = async (f: FacturaCompra, status: FacturaCompra['status'], closure_reason?: string) => {
    try {
      await updateFactura.mutateAsync({ purchaseId: oc.id, invoiceId: f.id, status, closure_reason });
      toast.success(status === 'matched' || status === 'paid' ? 'Conciliada — costo real en la OT' : 'Actualizada');
    } catch (e: any) {
      // El calce en vivo puede exigir motivo aunque la pantalla no lo muestre
      // todavía — no se pide de entrada porque la mayoría de los cierres no
      // tiene diferencia.
      if (!closure_reason && /MOTIVO_REQUERIDO|motivo/i.test(e?.message ?? '')) {
        const motivo = window.prompt(`${e.message}`);
        if (motivo?.trim()) await setStatus(f, status, motivo.trim());
        return;
      }
      toast.error(e?.message ?? 'Error');
    }
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
                  {/* Se cerró con diferencia: queda a la vista quién y por qué,
                      no sólo que ocurrió. */}
                  {f.closure_reason && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                      Cerrada con diferencia: {f.closure_reason}
                    </p>
                  )}
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

        {/* New factura — oculto cuando la OC no puede recibir una: mostrar el
            formulario para una Anulada invitaba a reabrirla por esta puerta
            (auditoría 2026-10-02, el servidor ya la cierra aparte). */}
        {!ocActions(oc.status as OCStatus).facturar ? (
          <p className="text-sm text-muted-foreground rounded-lg border bg-muted/30 p-3">
            Esta OC está {(OC_STATUS[oc.status]?.label ?? oc.status).toLowerCase()}: no puede recibir facturas nuevas.
          </p>
        ) : (
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
        )}
      </DialogContent>
    </Dialog>
  );
}
