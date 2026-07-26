'use client';

/**
 * "Cerrar día" — the moment the Golden Thread closes in money.
 *
 * A supervisor picks the day and sees exactly what will be charged: who was at
 * which machine, for how many hours, against which OT, at what cost. Nothing is
 * written until they confirm, and confirming twice is safe (the posting route
 * replaces that day's labour rows instead of stacking a second charge).
 *
 * Deliberately a preview-then-post flow rather than a single button: this posts
 * real money onto real orders, and the plant's clock data has honest gaps
 * (a forgotten clock-out, someone with no rate yet). Those are surfaced as
 * warnings *before* the write, not discovered afterwards in the cost report.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, AlertTriangle, Clock, Loader2 } from 'lucide-react';

interface PreviewLine {
  ot_id: string;
  ot_number: string | null;
  employee_id: string;
  employee_name: string | null;
  hours: number;
  regularHours: number;
  overtimeHours: number;
  hourlyRate: number;
  currency: string;
  cost: number;
}

interface PreviewWarning {
  code: string;
  employee_id: string;
  detail: string;
}

interface Preview {
  date: string;
  lines: PreviewLine[];
  warnings: PreviewWarning[];
  totalCost: number;
  totalHours: number;
  unattributedHours: number;
}

const money = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'CLP' ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
};

export function CerrarDiaDialog({ date }: { date: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = async () => {
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const res = await fetch(`/api/labor-costs?date=${encodeURIComponent(date)}`, {
        credentials: 'include',
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'No se pudo calcular la mano de obra');
      setPreview(body as Preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calcular la mano de obra');
    } finally {
      setLoading(false);
    }
  };

  const openDialog = () => {
    setOpen(true);
    loadPreview();
  };

  const confirmPost = async () => {
    setPosting(true);
    try {
      const res = await fetch('/api/labor-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ date }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'No se pudo cerrar el día');

      const otCount = (body?.ots ?? []).length;
      toast({
        title: 'Día cerrado',
        description:
          otCount > 0
            ? `Se cargó la mano de obra de ${body.totalHours} h a ${otCount} ${otCount === 1 ? 'OT' : 'OTs'}.`
            : 'No había horas atribuibles para cargar.',
      });

      // The OT cost views read this.
      queryClient.invalidateQueries({ queryKey: ['ot-real-costs'] });
      queryClient.invalidateQueries({ queryKey: ['ots'] });
      setOpen(false);
    } catch (err) {
      toast({
        title: 'No se pudo cerrar el día',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setPosting(false);
    }
  };

  const hasLines = (preview?.lines?.length ?? 0) > 0;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={openDialog}
        className="h-6 px-2 text-[10px] gap-1"
        title="Calcular y cargar la mano de obra del día a sus OTs"
      >
        <CalendarCheck className="h-3 w-3" />
        Cerrar día
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cerrar día — {date}</DialogTitle>
            <DialogDescription>
              Las horas marcadas en las estaciones se cargan como mano de obra real a la OT que
              corrió en cada máquina. Revisa antes de confirmar; volver a cerrar el mismo día
              reemplaza el cálculo, no lo duplica.
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Calculando…
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {preview && !loading && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border border-border p-3">
                  <div className="text-xl font-bold tabular-nums text-foreground">
                    {preview.totalHours}
                  </div>
                  <div className="text-xs text-muted-foreground">horas atribuidas</div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-xl font-bold tabular-nums text-foreground">
                    {money(preview.totalCost, preview.lines[0]?.currency || 'CLP')}
                  </div>
                  <div className="text-xs text-muted-foreground">costo de mano de obra</div>
                </div>
                <div
                  className={`rounded-md border p-3 ${
                    preview.unattributedHours > 0 ? 'border-amber-500/40 bg-amber-500/5' : 'border-border'
                  }`}
                >
                  <div className="text-xl font-bold tabular-nums text-foreground">
                    {preview.unattributedHours}
                  </div>
                  <div className="text-xs text-muted-foreground">horas sin OT</div>
                </div>
              </div>

              {hasLines ? (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 px-3 font-semibold">Persona</th>
                        <th className="py-2 px-3 font-semibold">OT</th>
                        <th className="py-2 px-3 font-semibold text-right">Horas</th>
                        <th className="py-2 px-3 font-semibold text-right">Tarifa</th>
                        <th className="py-2 px-3 font-semibold text-right">Costo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.lines.map((line, i) => (
                        <tr key={`${line.ot_id}-${line.employee_id}-${i}`} className="border-b border-border last:border-0">
                          <td className="py-2 px-3 text-foreground">
                            {line.employee_name || line.employee_id.slice(0, 8)}
                          </td>
                          <td className="py-2 px-3 font-mono text-xs text-foreground">
                            {line.ot_number || line.ot_id.slice(0, 8)}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">
                            {line.hours}
                            {line.overtimeHours > 0 && (
                              <span className="ml-1 text-xs text-amber-600">
                                (+{line.overtimeHours} extra)
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                            {money(line.hourlyRate, line.currency)}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums font-medium text-foreground">
                            {money(line.cost, line.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                  <Clock className="mx-auto mb-2 h-5 w-5 opacity-50" />
                  No hay horas atribuibles a una OT en este día. Se necesitan marcas de reloj en
                  estación y una asignación con OT.
                </div>
              )}

              {preview.warnings.length > 0 && (
                <div className="space-y-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" />
                    Revisa antes de cerrar
                  </div>
                  {preview.warnings.slice(0, 8).map((w, i) => (
                    <div key={i} className="text-xs text-muted-foreground">
                      <Badge variant="outline" className="mr-2 border-amber-500/40 text-amber-600">
                        {w.code}
                      </Badge>
                      {w.detail}
                    </div>
                  ))}
                  {preview.warnings.length > 8 && (
                    <div className="text-xs text-muted-foreground">
                      …y {preview.warnings.length - 8} más.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={posting}>
              Cancelar
            </Button>
            <Button onClick={confirmPost} disabled={posting || loading || !hasLines}>
              {posting ? 'Cargando…' : 'Confirmar y cargar a las OTs'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default CerrarDiaDialog;
