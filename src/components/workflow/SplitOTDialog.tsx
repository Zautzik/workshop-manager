'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Scissors, ArrowRight, Package } from 'lucide-react';

interface SplitOTDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ot: {
    id: string;
    ot_number: string;
    client_name: string;
    product_name?: string;
    status: string;
    quantity: number;
  };
  targetStatus: string;
  targetStatusLabel: string;
  onSuccess: () => void;
}

export function SplitOTDialog({
  open,
  onOpenChange,
  ot,
  targetStatus,
  targetStatusLabel,
  onSuccess,
}: SplitOTDialogProps) {
  const { toast } = useToast();
  const [advanceQty, setAdvanceQty] = useState<number>(Math.floor(ot.quantity / 2));
  const [saving, setSaving] = useState(false);

  const total = Number(ot.quantity) || 0;
  const remaining = total - advanceQty;
  const advancePct = total > 0 ? Math.round((advanceQty / total) * 100) : 0;
  const remainPct = 100 - advancePct;
  const isValid = advanceQty > 0 && advanceQty < total;

  const handleSplit = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/ots/${ot.id}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advance_quantity: advanceQty, target_status: targetStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Error al dividir OT', description: data.error ?? 'Intente de nuevo', variant: 'destructive' });
        return;
      }
      toast({
        title: 'OT dividida',
        description: `${ot.ot_number} → ${data.split.ot_number} (${advanceQty} uds.) avanza a ${targetStatusLabel}`,
      });
      onSuccess();
      onOpenChange(false);
    } catch {
      toast({ title: 'Error de red', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-4 w-4 text-amber-400" />
            División parcial de OT
          </DialogTitle>
          <DialogDescription>
            {ot.ot_number} — {ot.client_name}
            {ot.product_name && ` · ${ot.product_name}`}
          </DialogDescription>
        </DialogHeader>

        {/* Visual split preview */}
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Package className="h-3.5 w-3.5" />
            <span>Cantidad total: <strong className="text-foreground">{total} uds.</strong></span>
          </div>

          {/* Split bar */}
          <div className="space-y-2">
            <div className="flex h-8 rounded-lg overflow-hidden border border-border">
              <div
                className="flex items-center justify-center text-xs font-bold text-white transition-all duration-150"
                style={{ width: `${advancePct}%`, background: '#22c55e', minWidth: advancePct > 5 ? undefined : 0 }}
              >
                {advancePct > 10 && `${advancePct}%`}
              </div>
              <div
                className="flex items-center justify-center text-xs font-bold text-white transition-all duration-150"
                style={{ width: `${remainPct}%`, background: '#f59e0b' }}
              >
                {remainPct > 10 && `${remainPct}%`}
              </div>
            </div>
            <div className="flex justify-between text-xs">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500" />
                <span className="text-green-400 font-semibold">{advanceQty} uds.</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <Badge variant="outline" className="text-[10px] py-0 px-1.5">{targetStatusLabel}</Badge>
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500" />
                <span className="text-amber-400 font-semibold">{remaining} uds.</span>
                <span className="text-muted-foreground">queda en {ot.status}</span>
              </span>
            </div>
          </div>

          {/* Quantity input */}
          <div className="space-y-1.5">
            <Label className="text-xs">Unidades que avanzan</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={total - 1}
                value={advanceQty}
                onChange={e => setAdvanceQty(Math.min(total - 1, Math.max(1, Number(e.target.value))))}
                className="h-9 text-sm w-32"
              />
              <input
                type="range"
                min={1}
                max={total - 1}
                value={advanceQty}
                onChange={e => setAdvanceQty(Number(e.target.value))}
                className="flex-1 accent-green-500"
              />
            </div>
            {!isValid && (
              <p className="text-xs text-destructive">Debe ser entre 1 y {total - 1}</p>
            )}
          </div>

          <div className="bg-muted/40 border border-border rounded-md p-3 text-xs text-muted-foreground space-y-1">
            <p>🔀 Se creará <strong className="text-foreground">{ot.ot_number}-B</strong> con {advanceQty} uds. en <strong className="text-foreground">{targetStatusLabel}</strong></p>
            <p>📌 <strong className="text-foreground">{ot.ot_number}-A</strong> ({remaining} uds.) permanece en <strong className="text-foreground">{ot.status}</strong></p>
            <p className="text-muted-foreground/70">Ambas OTs se marcan con tono reducido en el kanban.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleSplit}
            disabled={!isValid || saving}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            <Scissors className="h-3.5 w-3.5 mr-1.5" />
            {saving ? 'Dividiendo...' : 'Dividir y avanzar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
