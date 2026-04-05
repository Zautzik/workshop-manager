'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Card } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Plus, X, FileText, Download } from 'lucide-react';
import type { OTFormData, MultiQuantityQuote } from '@/types/ot';
import { computeOTPricing, computeMultiQuantityQuotes } from '@/lib/ot-calculations';
import { generateQuotePDF } from '@/lib/ot-quote-pdf';

interface Props {
  form: OTFormData;
  updateForm: (patch: Partial<OTFormData>) => void;
}

/* ─── Cost bucket colours ───────────────────────────────────── */
const BUCKET_COLORS = ['#22d3ee', '#a78bfa', '#f97316']; // cyan, violet, orange

export function OTStepPricing({ form, updateForm }: Props) {
  const { pricing, quantity, operations, extra_quantities } = form;
  const [multiQuotes, setMultiQuotes] = useState<MultiQuantityQuote[]>([]);
  const [newQty, setNewQty] = useState('');

  const recalc = (
    marginPct = pricing.margin_pct,
    incrementPct = pricing.increment_pct,
    commissionPct = pricing.commission_pct
  ) => {
    const p = computeOTPricing(operations, quantity, marginPct, incrementPct, commissionPct);
    updateForm({ pricing: p });
  };

  // Recalculate on mount
  useEffect(() => {
    recalc();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute multi-quantity quotes whenever extra_quantities or pricing changes
  useEffect(() => {
    if (extra_quantities.length > 0) {
      const quotes = computeMultiQuantityQuotes(
        quantity,
        operations,
        extra_quantities,
        pricing.margin_pct,
        pricing.increment_pct,
        pricing.commission_pct
      );
      setMultiQuotes(quotes);
    } else {
      setMultiQuotes([]);
    }
  }, [extra_quantities, quantity, operations, pricing.margin_pct, pricing.increment_pct, pricing.commission_pct]);

  const addExtraQuantity = () => {
    const qty = parseInt(newQty);
    if (qty > 0 && !extra_quantities.includes(qty)) {
      updateForm({ extra_quantities: [...extra_quantities, qty].sort((a, b) => a - b) });
    }
    setNewQty('');
  };

  const removeExtraQuantity = (qty: number) => {
    updateForm({ extra_quantities: extra_quantities.filter((q) => q !== qty) });
  };

  const fmt = (val: number) =>
    `$${val.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const fmtUnit = (val: number) =>
    `$${Math.round(val).toLocaleString('es-CL')}`;

  /* ─── Cost distribution for pie chart ───────────────────── */
  const costBuckets = useMemo(() => {
    let materials = 0;
    let machineLabor = 0;
    let outsourced = 0;

    for (const op of operations) {
      if (op.category === 'materiales') {
        materials += op.total_cost;
      } else if (op.category === 'tercerizado') {
        outsourced += op.total_cost;
      } else {
        machineLabor += op.total_cost;
      }
    }

    const total = materials + machineLabor + outsourced;
    const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

    return [
      { name: 'Materiales', value: materials, pct: pct(materials) },
      { name: 'Máquina + Salarios', value: machineLabor, pct: pct(machineLabor) },
      { name: 'Tercerizado', value: outsourced, pct: pct(outsourced) },
    ].filter((b) => b.value > 0);
  }, [operations]);

  return (
    <div className="space-y-2">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-foreground">Precio</h2>
      </div>

      <div className="max-w-lg mx-auto space-y-6">
        {/* ─── Price breakdown card ─────────────────────── */}
        <div className="border border-border rounded-xl p-6 bg-card/80 space-y-4">
          {/* Subtotal */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Subtotal (Costo Base)</span>
            <span className="text-lg font-semibold text-foreground">{fmt(pricing.subtotal)}</span>
          </div>

          <Separator className="bg-border" />

          {/* Margin */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Margen</span>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={pricing.margin_pct}
                  onChange={(e) => {
                    const pct = parseFloat(e.target.value) || 0;
                    recalc(pct, pricing.increment_pct, pricing.commission_pct);
                  }}
                  className="bg-input border-border w-16 h-7 text-xs text-center text-primary font-bold"
                />
                <span className="text-xs text-primary font-bold">%</span>
              </div>
            </div>
            <span className="text-sm text-foreground">+ {fmt(pricing.margin_amount)}</span>
          </div>

          {/* Increment */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Incremento</span>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={pricing.increment_pct}
                  onChange={(e) => {
                    const pct = parseFloat(e.target.value) || 0;
                    recalc(pricing.margin_pct, pct, pricing.commission_pct);
                  }}
                  className="bg-input border-border w-16 h-7 text-xs text-center text-primary font-bold"
                />
                <span className="text-xs text-primary font-bold">%</span>
              </div>
            </div>
            <span className="text-sm text-foreground">+ {fmt(pricing.increment_amount)}</span>
          </div>

          {/* Commission */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Comisión</span>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={pricing.commission_pct}
                  onChange={(e) => {
                    const pct = parseFloat(e.target.value) || 0;
                    recalc(pricing.margin_pct, pricing.increment_pct, pct);
                  }}
                  className="bg-input border-border w-16 h-7 text-xs text-center text-primary font-bold"
                />
                <span className="text-xs text-primary font-bold">%</span>
              </div>
            </div>
            <span className="text-sm text-foreground">+ {fmt(pricing.commission_amount)}</span>
          </div>

          <Separator className="bg-border" />

          {/* Total */}
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-foreground">TOTAL</span>
            <span className="text-3xl font-bold text-primary">{fmt(pricing.total_price)}</span>
          </div>

          <Separator className="bg-border" />

          {/* Unit price */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Precio Unitario ({quantity.toLocaleString()} unidades)
            </span>
            <span className="text-sm font-semibold text-foreground">
              {fmtUnit(pricing.unit_price)}
            </span>
          </div>
        </div>

        {/* ─── Multi-quantity quoting ───────────────────── */}
        <div className="border border-border rounded-xl p-6 bg-card/80">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Cotización Multi-Cantidad
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Compara precios para diferentes tirajes
          </p>

          {/* Add quantity input */}
          <div className="flex items-center gap-2 mb-3">
            <Input
              type="number"
              min={1}
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addExtraQuantity())}
              placeholder="Ej: 2000"
              className="bg-input border-border h-8 text-sm flex-1"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1"
              onClick={addExtraQuantity}
              disabled={!newQty || parseInt(newQty) <= 0}
            >
              <Plus className="h-3 w-3" />
              Agregar
            </Button>
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {[500, 1000, 2000, 3000, 5000, 10000].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  if (!extra_quantities.includes(q)) {
                    updateForm({ extra_quantities: [...extra_quantities, q].sort((a, b) => a - b) });
                  }
                }}
                className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-all"
              >
                {q.toLocaleString()}
              </button>
            ))}
          </div>

          {/* Comparison table */}
          {multiQuotes.length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Cantidad</th>
                    <th className="text-right px-3 py-2 text-muted-foreground font-medium">Total</th>
                    <th className="text-right px-3 py-2 text-muted-foreground font-medium">Unitario</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Current quantity (always shown) */}
                  <tr className="border-t border-border bg-primary/5">
                    <td className="px-3 py-2 font-bold text-primary">
                      {quantity.toLocaleString()} ★
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-primary">
                      {fmt(pricing.total_price)}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-primary">
                      {fmtUnit(pricing.unit_price)}
                    </td>
                    <td></td>
                  </tr>
                  {multiQuotes.map((q) => (
                    <tr key={q.quantity} className="border-t border-border/50">
                      <td className="px-3 py-2 font-medium text-foreground">
                        {q.quantity.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right text-foreground">
                        {fmt(q.total_price)}
                      </td>
                      <td className="px-3 py-2 text-right text-foreground">
                        {fmtUnit(q.unit_price)}
                      </td>
                      <td className="px-1">
                        <button
                          type="button"
                          onClick={() => removeExtraQuantity(q.quantity)}
                          className="text-muted-foreground hover:text-red-400 p-1"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ─── Cost distribution pie chart ──────────────── */}
        {costBuckets.length > 0 && (
          <div className="border border-border rounded-xl p-6 bg-card/80">
            <h3 className="text-sm font-semibold text-foreground text-center mb-4">
              Distribución de Costos
            </h3>

            <div className="flex items-center justify-center gap-6">
              {/* Pie */}
              <div className="w-44 h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={costBuckets}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={68}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {costBuckets.map((_, idx) => (
                        <Cell key={idx} fill={BUCKET_COLORS[idx % BUCKET_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => fmt(value)}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend */}
              <div className="space-y-3">
                {costBuckets.map((bucket, idx) => (
                  <div key={bucket.name} className="flex items-center gap-3">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: BUCKET_COLORS[idx % BUCKET_COLORS.length] }}
                    />
                    <div>
                      <p className="text-xs font-medium text-foreground">
                        {bucket.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {bucket.pct}% — {fmt(bucket.value)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── PDF Export ──────────────────────────────── */}
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/10"
          onClick={() => generateQuotePDF(form, null, multiQuotes)}
        >
          <Download className="h-4 w-4" />
          Exportar Cotización PDF
        </Button>
      </div>
    </div>
  );
}
