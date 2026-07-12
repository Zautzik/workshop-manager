'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, TrendingUp, CheckCircle2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { formatCLP } from '@/lib/format';
import { useCostAlerts, useSetCostThreshold } from '@/hooks/use-cost-alerts';

export function CostOverrunAlerts() {
  const { data } = useCostAlerts();
  const setThreshold = useSetCostThreshold();
  const [value, setValue] = useState<number | ''>('');

  // Seed the input from the saved threshold once it loads.
  useEffect(() => {
    if (data?.threshold != null && value === '') setValue(data.threshold);
  }, [data?.threshold]); // eslint-disable-line react-hooks/exhaustive-deps

  const alerts = data?.alerts ?? [];

  const save = async () => {
    const t = Number(value);
    if (!Number.isFinite(t) || t < 0) { toast.error('Umbral inválido'); return; }
    try { await setThreshold.mutateAsync(t); toast.success('Umbral actualizado'); }
    catch (e: any) { toast.error(e?.message ?? 'Error'); }
  };

  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Alerta de sobrecosto de OT
          </CardTitle>
          <div className="flex items-end gap-2">
            <div className="space-y-0.5">
              <label className="text-[11px] text-muted-foreground">Umbral (real vs estimado)</label>
              <div className="flex items-center gap-1">
                <Input type="number" value={value} onChange={(e) => setValue(e.target.value === '' ? '' : Number(e.target.value))}
                  className="h-8 w-20 text-sm" min={0} />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <Button size="sm" onClick={save} disabled={setThreshold.isPending}><Save className="h-3.5 w-3.5 mr-1" /> Guardar</Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Marca las OT cuyo costo real supera el estimado en ≥ {data?.threshold ?? 15}%, desde el ledger unificado.
        </p>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
            <CheckCircle2 className="h-4 w-4 text-green-600" /> Ninguna OT supera el umbral. Todo dentro de presupuesto.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-muted-foreground">
                <th className="text-left py-2 px-2 font-medium">OT</th>
                <th className="text-left py-2 px-2 font-medium">Cliente</th>
                <th className="text-right py-2 px-2 font-medium">Estimado</th>
                <th className="text-right py-2 px-2 font-medium">Real</th>
                <th className="text-right py-2 px-2 font-medium">Sobrecosto</th>
              </tr></thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.ot_id} className="border-b hover:bg-muted/40">
                    <td className="py-2 px-2 font-mono text-xs">{a.ot_number}</td>
                    <td className="py-2 px-2 max-w-[220px] truncate">{a.client_name ?? '—'}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{formatCLP(a.estimated_cost)}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-semibold">{formatCLP(a.actual_cost)}</td>
                    <td className="py-2 px-2 text-right">
                      <Badge className="bg-red-500/15 text-red-600 gap-1">
                        <TrendingUp className="h-3 w-3" /> +{a.overrun_pct.toFixed(0)}% · {formatCLP(a.overrun_amount)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
