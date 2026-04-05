'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  DollarSign,
  TrendingUp,
  Calculator,
} from 'lucide-react';
import type { OTProductionForm } from '@/types/ot-production';
import type { CostCenterItem, ProductionCostLine } from '@/types/work-category';
import { COST_CATEGORIES } from '@/types/work-category';
import { computeProductionCosts, summarizeCosts } from '@/lib/production-costs';

/* ================================================================ */
/*  Production Cost Breakdown — live cost panel inside the OT form   */
/* ================================================================ */

interface ProductionCostBreakdownProps {
  form: OTProductionForm;
  /** Optional cost center overrides — if not provided uses defaults */
  costCenter?: CostCenterItem[];
  /** Callback to pass computed costs to parent */
  onCostsComputed?: (lines: ProductionCostLine[], total: number) => void;
}

export default function ProductionCostBreakdown({
  form,
  costCenter,
  onCostsComputed,
}: ProductionCostBreakdownProps) {
  const { categories, grandTotal, lines } = useMemo(() => {
    const costLines = computeProductionCosts(form, costCenter);
    const summary = summarizeCosts(costLines);
    // Notify parent
    onCostsComputed?.(costLines, summary.grandTotal);
    return { ...summary, lines: costLines };
  }, [form, costCenter]);

  const fmtCLP = (n: number) =>
    `$${n.toLocaleString('es-CL')}`;

  const unitCost = form.cantidad_total > 0
    ? grandTotal / form.cantidad_total
    : 0;

  if (lines.length === 0) {
    return (
      <Card className="border-dashed border-2 border-muted">
        <CardContent className="p-6 text-center text-muted-foreground">
          <Calculator className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Complete los datos de producción para ver el desglose de costos estimado.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-green-200 dark:border-green-900">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-5 w-5 text-green-600" />
            Desglose de Costos de Producción
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground uppercase">Costo Unitario</div>
              <div className="text-sm font-bold text-green-700 dark:text-green-400">
                {fmtCLP(Math.round(unitCost))}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground uppercase">Costo Total</div>
              <div className="text-lg font-bold text-green-700 dark:text-green-400">
                {fmtCLP(grandTotal)}
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {categories.map((cat) => {
          const catMeta = COST_CATEGORIES.find((c) => c.value === cat.category);
          return (
            <div key={cat.category} className="space-y-1">
              {/* Category header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{catMeta?.icon || '📋'}</span>
                  <span className="text-xs font-bold uppercase" style={{ color: catMeta?.color }}>
                    {cat.label}
                  </span>
                </div>
                <span className="text-xs font-bold">{fmtCLP(cat.total)}</span>
              </div>

              {/* Lines */}
              {cat.lines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center justify-between text-[11px] pl-6 py-0.5 text-muted-foreground"
                >
                  <span className="flex-1 truncate">{line.description}</span>
                  <span className="w-16 text-right tabular-nums">
                    {Math.round(line.quantity).toLocaleString('es-CL')}
                  </span>
                  <span className="w-12 text-center text-[10px]">{line.unit}</span>
                  <span className="w-20 text-right tabular-nums">× {fmtCLP(line.unit_cost)}</span>
                  <span className="w-24 text-right font-medium text-foreground tabular-nums">
                    {fmtCLP(line.total_cost)}
                  </span>
                </div>
              ))}

              <Separator className="!mt-1" />
            </div>
          );
        })}

        {/* Grand total bar */}
        <div className="flex items-center justify-between pt-2 border-t-2 border-green-300 dark:border-green-800">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span className="font-bold text-sm">COSTO TOTAL ESTIMADO</span>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-green-700 dark:text-green-400">
              {fmtCLP(grandTotal)}
            </div>
            {form.cantidad_total > 0 && (
              <div className="text-[10px] text-muted-foreground">
                {fmtCLP(Math.round(unitCost))} / unidad × {form.cantidad_total.toLocaleString('es-CL')} unidades
              </div>
            )}
          </div>
        </div>

        {/* Percentage bars */}
        <div className="space-y-1 pt-2">
          {categories.map((cat) => {
            const pct = grandTotal > 0 ? (cat.total / grandTotal) * 100 : 0;
            const catMeta = COST_CATEGORIES.find((c) => c.value === cat.category);
            return (
              <div key={cat.category} className="flex items-center gap-2 text-[10px]">
                <span className="w-28 truncate">{cat.label}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      backgroundColor: catMeta?.color || '#666',
                    }}
                  />
                </div>
                <span className="w-10 text-right tabular-nums font-medium">
                  {Math.round(pct)}%
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
