'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { PackageCheck } from 'lucide-react';
import {
  usePurchaseOrder, useReceiveOC, useStockItems,
  type OCRow, type PurchaseOrderLine,
} from '@/hooks/use-procurement-queries';

// ── Goods receipt against an OC (creates a lot linked to the OC) ─────────────
export function ReceiveDialog({ oc, onClose }: { oc: OCRow | null; onClose: () => void }) {
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
