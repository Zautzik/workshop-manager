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
import { aggregateMarginConfidence, marginConfidence } from '@/lib/margin-confidence';
import { RentabilidadPanorama } from '@/components/financial/RentabilidadPanorama';
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
    // El porcentaje ya no se calcula aquí: con costo real en cero, margen es
    // igual a ingreso y esto informaba 100%.
    const verdict   = aggregateMarginConfidence(rows);
    return { revenue, estimated, actual, margin, verdict };
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
      {/* Panorama: fichas de titular y los dos gráficos. Reemplaza la fila de
          cuatro tarjetas de texto — el margen sigue siendo el mismo veredicto,
          ahora con la forma que le corresponde a cada dato. */}
      <RentabilidadPanorama rows={rows as any} />


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
                  {/* Vista de tabla del desglose: en claro, «Máquina» y «Otros»
                      quedan bajo 3:1 de contraste en el gráfico, y la regla de
                      relieve exige que su valor se pueda leer sin el tooltip. */}
                  <th className="text-right py-2 px-3 font-medium">Materiales</th>
                  <th className="text-right py-2 px-3 font-medium">Mano de obra</th>
                  <th className="text-right py-2 px-3 font-medium">Máquina</th>
                  <th className="text-right py-2 px-3 font-medium">Otros</th>
                  <th className="text-right py-2 px-3 font-medium text-amber-600">Estimado</th>
                  <th className="text-right py-2 px-3 font-medium text-destructive">Real</th>
                  <th className="text-right py-2 px-3 font-medium text-primary">Ingresos</th>
                  <th className="text-right py-2 px-3 font-medium">Margen</th>
                  <th className="text-right py-2 px-3 font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={11} className="py-8 text-center text-muted-foreground">Sin datos en el ledger todavía.</td></tr>
                )}
                {rows.map((r) => {
                  const v = marginConfidence(r);
                  return (
                    <tr key={r.ot_id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-3 font-medium">{r.ot_number}</td>
                      <td className="py-2 px-3 text-muted-foreground">{r.client_name}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{formatCLP(r.material_actual)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{formatCLP(r.labor_actual)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{formatCLP(r.machine_actual)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{formatCLP(r.other_actual)}</td>
                      <td className="py-2 px-3 text-right text-amber-600">{formatCLP(r.estimated_cost)}</td>
                      <td className="py-2 px-3 text-right text-destructive">{formatCLP(r.actual_cost)}</td>
                      <td className="py-2 px-3 text-right text-primary">{formatCLP(r.revenue)}</td>
                      <td className={`py-2 px-3 text-right font-semibold ${
                        v.confidence !== 'medido' ? 'text-muted-foreground' : v.amount! >= 0 ? 'text-green-600' : 'text-red-500'
                      }`}>
                        {v.confidence === 'medido' ? formatCLP(v.amount!) : '—'}
                      </td>
                      <td className="py-2 px-3 text-right" title={v.hint ?? undefined}>
                        {v.pct !== null
                          ? `${v.pct}%`
                          : <span className="text-muted-foreground text-xs italic">{v.label}</span>}
                      </td>
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
