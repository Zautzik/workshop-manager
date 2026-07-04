'use client';
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Package } from 'lucide-react';
import { formatCLP } from '@/lib/format';
import { useMaterialCost } from '@/hooks/use-cost-catalog';

// A real cost is "drifted" from the catalog when it differs by more than this.
const DRIFT_PCT = 5;

export function MaterialCostPanel() {
  const { data: rows = [], isLoading } = useMaterialCost();

  const withLots = useMemo(() => rows.filter((r) => r.lot_count > 0), [rows]);
  const drifted = useMemo(
    () => withLots.filter((r) => {
      const est = Number(r.estimated_unit_cost) || 0;
      if (est === 0) return false;
      return Math.abs((Number(r.weighted_cost) - est) / est) * 100 >= DRIFT_PCT;
    }),
    [withLots]
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi label="Materiales con compras" value={String(withLots.length)} hint="tienen lotes reales" tint="text-foreground" />
        <Kpi label="Con desviación" value={String(drifted.length)} hint={`real vs catálogo > ${DRIFT_PCT}%`} tint="text-amber-600" />
        <Kpi label="Catálogo (sin compras)" value={String(rows.length - withLots.length)} hint="precian al estimado" tint="text-muted-foreground" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Costo real de materiales (desde compras)</CardTitle>
          <p className="text-xs text-muted-foreground">Promedio ponderado por cantidad recibida en los lotes reales. La desviación marca dónde el catálogo se aleja de lo que efectivamente pagamos.</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-muted-foreground">
                <th className="text-left py-2 px-2 font-medium">Material</th>
                <th className="text-right py-2 px-2 font-medium">Estimado</th>
                <th className="text-right py-2 px-2 font-medium">Real (ponderado)</th>
                <th className="text-right py-2 px-2 font-medium">Última compra</th>
                <th className="text-center py-2 px-2 font-medium">Lotes</th>
                <th className="text-right py-2 px-2 font-medium">Desviación</th>
              </tr></thead>
              <tbody>
                {isLoading && <tr><td colSpan={6} className="text-center text-muted-foreground py-8">Cargando…</td></tr>}
                {!isLoading && withLots.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-muted-foreground py-8">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    Aún no hay compras (lotes) para ponderar. Recibe OCs en Compras para alimentar el costo real.
                  </td></tr>
                )}
                {withLots.map((r) => {
                  const est = Number(r.estimated_unit_cost) || 0;
                  const real = Number(r.weighted_cost) || 0;
                  const diffPct = est > 0 ? ((real - est) / est) * 100 : 0;
                  const drift = Math.abs(diffPct) >= DRIFT_PCT;
                  return (
                    <tr key={r.item_id} className="border-b hover:bg-muted/40">
                      <td className="py-2 px-2">
                        <div className="font-medium truncate max-w-[260px]">{r.name}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{r.sku} · {r.unit}</div>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{formatCLP(est)}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold">{formatCLP(real)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {r.latest_cost != null ? formatCLP(Number(r.latest_cost)) : '—'}
                        {r.latest_received && <div className="text-[10px] text-muted-foreground">{new Date(r.latest_received).toLocaleDateString('es-CL')}</div>}
                      </td>
                      <td className="py-2 px-2 text-center text-muted-foreground">{r.lot_count}</td>
                      <td className="py-2 px-2 text-right">
                        {est > 0 ? (
                          <Badge className={drift ? (diffPct > 0 ? 'bg-red-500/15 text-red-600' : 'bg-green-500/15 text-green-600') : 'bg-muted text-muted-foreground'}>
                            {diffPct > 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                            {diffPct > 0 ? '+' : ''}{diffPct.toFixed(1)}%
                          </Badge>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
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
}

function Kpi({ label, value, hint, tint }: { label: string; value: string; hint: string; tint: string }) {
  return (
    <div className="rounded-lg border bg-card/60 p-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${tint}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
    </div>
  );
}
