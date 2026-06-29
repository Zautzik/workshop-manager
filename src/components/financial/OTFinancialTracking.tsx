'use client';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { TrendingUp, TrendingDown, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useOtCostSummary } from '@/hooks/use-financial-queries';
import { useOTs } from '@/hooks/use-operations-queries';
import { formatCLP } from '@/lib/format';

// Cost categories map 1:1 to the ledger's cost_line_category.
const COST_FIELDS = [
  { key: 'material',   label: 'Materiales (papel, tinta…)' },
  { key: 'labor',      label: 'Mano de obra' },
  { key: 'machine',    label: 'Máquina / energía' },
  { key: 'finishing',  label: 'Terminaciones' },
  { key: 'outsourced', label: 'Tercerizado' },
  { key: 'overhead',   label: 'Gastos generales' },
] as const;

type CostKey = (typeof COST_FIELDS)[number]['key'];

export const OTFinancialTracking = () => {
  const queryClient = useQueryClient();
  const { data: rows = [] } = useOtCostSummary();
  const { data: ots = [] } = useOTs();

  const [selectedOtId, setSelectedOtId] = useState('');
  const [amounts, setAmounts] = useState<Record<CostKey, number>>({
    material: 0, labor: 0, machine: 0, finishing: 0, outsourced: 0, overhead: 0,
  });
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => {
    const revenue   = rows.reduce((s, r) => s + Number(r.revenue || 0), 0);
    const estimated = rows.reduce((s, r) => s + Number(r.estimated_cost || 0), 0);
    const actual    = rows.reduce((s, r) => s + Number(r.actual_cost || 0), 0);
    const margin    = rows.reduce((s, r) => s + Number(r.gross_margin || 0), 0);
    const marginPct = revenue > 0 ? Math.round((margin / revenue) * 100) : 0;
    return { revenue, estimated, actual, margin, marginPct };
  }, [rows]);

  const resetForm = () => {
    setSelectedOtId('');
    setAmounts({ material: 0, labor: 0, machine: 0, finishing: 0, outsourced: 0, overhead: 0 });
  };

  const handleSubmit = async () => {
    if (!selectedOtId) { toast.error('Seleccione una OT'); return; }
    const lines = COST_FIELDS
      .filter((f) => Number(amounts[f.key]) > 0)
      .map((f) => ({ category: f.key, description: f.label, quantity: 1, unit: 'global', unit_cost: amounts[f.key] }));
    if (lines.length === 0) { toast.error('Ingrese al menos un costo'); return; }

    setSaving(true);
    const res = await fetch('/api/ots/cost-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ot_id: selectedOtId, lines }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? 'Error al registrar costos');
      return;
    }
    toast.success('Costos reales registrados en el ledger');
    setIsOpen(false);
    resetForm();
    queryClient.invalidateQueries({ queryKey: ['otCostSummary'] });
  };

  return (
    <div className="space-y-6">
      {/* Summary — straight from the unified cost ledger */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-primary/20">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Ingresos</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-primary">{formatCLP(totals.revenue)}</div></CardContent>
        </Card>
        <Card className="border-amber-500/20">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Costo estimado</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-600">{formatCLP(totals.estimated)}</div></CardContent>
        </Card>
        <Card className="border-destructive/20">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Costo real</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{formatCLP(totals.actual)}</div></CardContent>
        </Card>
        <Card className={totals.margin >= 0 ? 'border-green-500/20' : 'border-red-500/20'}>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Margen ({totals.marginPct}%)</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold flex items-center gap-2 ${totals.margin >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {totals.margin >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              {formatCLP(totals.margin)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button onClick={() => { resetForm(); setIsOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Registrar costo real
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Registrar costo real (ledger)</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Orden de Trabajo</Label>
              <select
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2"
                value={selectedOtId}
                onChange={(e) => setSelectedOtId(e.target.value)}
              >
                <option value="">Seleccione una OT…</option>
                {ots.map((ot: any) => (
                  <option key={ot.id} value={ot.id}>{ot.ot_number} — {ot.client_name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {COST_FIELDS.map((f) => (
                <div key={f.key}>
                  <Label className="text-xs">{f.label} ($)</Label>
                  <Input
                    type="number" min="0"
                    value={amounts[f.key] || ''}
                    onChange={(e) => setAmounts({ ...amounts, [f.key]: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Cada monto se guarda como una línea <strong>actual</strong> en el ledger de costos de la OT.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setIsOpen(false); resetForm(); }}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Estimate vs Real per OT — one source of truth */}
      <Card>
        <CardHeader><CardTitle>Estimado vs Real por OT</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium">OT</th>
                  <th className="text-left py-2 px-3 font-medium">Cliente</th>
                  <th className="text-right py-2 px-3 font-medium text-amber-600">Estimado</th>
                  <th className="text-right py-2 px-3 font-medium text-destructive">Real</th>
                  <th className="text-right py-2 px-3 font-medium text-primary">Ingresos</th>
                  <th className="text-right py-2 px-3 font-medium">Margen</th>
                  <th className="text-right py-2 px-3 font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Sin datos en el ledger todavía.</td></tr>
                )}
                {rows.map((r) => {
                  const pct = r.revenue > 0 ? Math.round((r.gross_margin / r.revenue) * 100) : 0;
                  return (
                    <tr key={r.ot_id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-3 font-medium">{r.ot_number}</td>
                      <td className="py-2 px-3 text-muted-foreground">{r.client_name}</td>
                      <td className="py-2 px-3 text-right text-amber-600">{formatCLP(r.estimated_cost)}</td>
                      <td className="py-2 px-3 text-right text-destructive">{formatCLP(r.actual_cost)}</td>
                      <td className="py-2 px-3 text-right text-primary">{formatCLP(r.revenue)}</td>
                      <td className={`py-2 px-3 text-right font-semibold ${r.gross_margin >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatCLP(r.gross_margin)}</td>
                      <td className="py-2 px-3 text-right">{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
