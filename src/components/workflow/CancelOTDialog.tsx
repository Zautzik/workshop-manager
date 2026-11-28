'use client';

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Ban } from 'lucide-react';

interface PreviewLot {
  lotId: string;
  lotNumber: string | null;
  itemName: string;
  unit: string;
  netQuantity: number;
  netSheets: number | null;
}

interface Preview {
  blocked: string | null;
  lots: PreviewLot[];
  siblings: string[];
}

interface CancelOTDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ot: { id: string; ot_number: string; client_name: string; product_name?: string };
  onSuccess: () => void;
}

const n = (v: number) => v.toLocaleString('es-CL');

/**
 * Cancelar una OT.
 *
 * Dos cosas que sólo sabe quien cancela: por qué, y cuánto del papel que salió
 * de bodega vuelve físicamente. Lo que ya se cortó o se imprimió no vuelve —
 * queda como costo real de la OT—, así que cada lote arranca en cero y se
 * escribe lo que de verdad regresa.
 */
export function CancelOTDialog({ open, onOpenChange, ot, onSuccess }: CancelOTDialogProps) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [sheets, setSheets] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let stale = false;
    fetch(`/api/ots/${ot.id}/cancel`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (stale) return;
        if (!res.ok) setLoadError(body?.error ?? 'No se pudo cargar la OT.');
        else setPreview(body as Preview);
      })
      .catch(() => { if (!stale) setLoadError('No se pudo cargar la OT.'); });
    return () => { stale = true; };
  }, [open, ot.id]);

  const lots = preview?.lots ?? [];
  const overLot = lots.find((l) => l.netSheets != null && (sheets[l.lotId] ?? 0) > l.netSheets);
  const totalOut = lots.reduce((s, l) => s + (l.netSheets ?? 0), 0);
  const totalBack = lots.reduce((s, l) => s + (sheets[l.lotId] ?? 0), 0);
  const canSubmit = !!preview && !preview.blocked && reason.trim().length >= 5 && !overLot && !saving;

  const handleCancel = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/ots/${ot.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reason.trim(),
          returns: lots
            .filter((l) => (sheets[l.lotId] ?? 0) > 0)
            .map((l) => ({ lot_id: l.lotId, sheets: sheets[l.lotId] })),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast({ title: 'No se pudo cancelar la OT', description: body?.error ?? 'Intentá de nuevo', variant: 'destructive' });
        return;
      }
      const partes = [
        body?.returned?.length
          ? `${n(body.returned.reduce((s: number, r: { sheets: number }) => s + r.sheets, 0))} pliegos volvieron a bodega ($${n(body.materialReturned ?? 0)})`
          : 'No volvió papel a bodega',
        body?.sheetsKept > 0 ? `${n(body.sheetsKept)} pliegos quedan como costo de la OT` : null,
        body?.reservationsReleased > 0 ? `${body.reservationsReleased} reserva(s) liberada(s)` : null,
      ].filter(Boolean);
      toast({
        title: body?.warning ? 'OT cancelada, con un pendiente' : `OT ${ot.ot_number} cancelada`,
        description: body?.warning ?? partes.join(' · '),
        variant: body?.warning ? 'destructive' : undefined,
      });
      onSuccess();
    } catch {
      toast({ title: 'Error de conexión', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="w-4 h-4 text-red-500" />
            Cancelar OT
          </DialogTitle>
          <DialogDescription>
            {ot.ot_number} — {ot.client_name}{ot.product_name ? ` · ${ot.product_name}` : ''}
          </DialogDescription>
        </DialogHeader>

        {loadError && <p className="text-sm text-red-500">{loadError}</p>}
        {!preview && !loadError && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {preview?.blocked && <p className="text-sm text-red-500">{preview.blocked}</p>}

        {preview && !preview.blocked && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground leading-snug">
              La OT sale del Tablero y no se puede volver a mover. Las horas, la mano de obra y los costos ya
              cargados se conservan: es lo que costó la cancelación.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="cancel-reason">¿Por qué se cancela?</Label>
              <Input
                id="cancel-reason"
                value={reason}
                maxLength={500}
                placeholder="El cliente desistió del pedido…"
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Papel que vuelve a bodega</Label>
              {lots.length === 0 && (
                <p className="text-xs text-muted-foreground">Esta OT no tiene papel afuera de bodega.</p>
              )}
              {lots.map((l) => (
                <div key={l.lotId} className="flex items-center gap-2 rounded-lg border border-border p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{l.itemName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Lote {l.lotNumber ?? '—'} · salieron{' '}
                      {l.netSheets != null ? `${n(l.netSheets)} pliegos` : `${n(l.netQuantity)} ${l.unit}`}
                    </p>
                  </div>
                  {l.netSheets != null ? (
                    <>
                      <Input
                        type="number"
                        min={0}
                        max={l.netSheets}
                        className="w-24 h-8 text-right"
                        aria-label={`Pliegos del lote ${l.lotNumber ?? ''} que vuelven a bodega`}
                        value={sheets[l.lotId] ?? 0}
                        onChange={(e) => setSheets((s) => ({ ...s, [l.lotId]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => setSheets((s) => ({ ...s, [l.lotId]: l.netSheets as number }))}
                      >
                        Todo
                      </Button>
                    </>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Se devuelve desde Bodega</span>
                  )}
                </div>
              ))}
              {overLot && (
                <p className="text-xs text-red-500">
                  Del lote {overLot.lotNumber ?? ''} salieron {n(overLot.netSheets ?? 0)} pliegos: no pueden volver más.
                </p>
              )}
              {lots.length > 0 && !overLot && (
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Vuelven {n(totalBack)} de {n(totalOut)} pliegos. Los otros {n(Math.max(0, totalOut - totalBack))} quedan
                  como costo real de la OT.
                </p>
              )}
              {preview.siblings.length > 0 && lots.length > 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-snug">
                  Este papel es de todo el trabajo: {preview.siblings.join(', ')} sigue{preview.siblings.length > 1 ? 'n' : ''} vigente
                  {preview.siblings.length > 1 ? 's' : ''}. Devolvé sólo lo que no van a usar.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Volver</Button>
          <Button variant="destructive" disabled={!canSubmit} onClick={handleCancel}>
            {saving ? 'Cancelando…' : 'Cancelar la OT'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
