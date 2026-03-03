'use client';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ImpositionResult } from '@/types/ot';

interface Props {
  imposition: ImpositionResult | null;
  widthCm: number;
  heightCm: number;
}

/**
 * Visual representation of how products are imposed on a 70×100 cm press sheet.
 * Shows a scaled grid with utilization stats.
 */
export function ImpositionPreview({ imposition, widthCm, heightCm }: Props) {
  if (!imposition || widthCm <= 0 || heightCm <= 0) return null;

  const { cols, rows, poses_per_sheet, sheet_utilization_pct, waste_pct, rotated, sheets_needed } = imposition;

  // Scale factor to fit in a ~280px wide preview
  const PREVIEW_W = 280;
  const PREVIEW_H = 400;
  const SHEET_W = 70; // press sheet cm
  const SHEET_H = 100;
  const scale = Math.min(PREVIEW_W / SHEET_W, PREVIEW_H / SHEET_H);

  const sw = SHEET_W * scale;
  const sh = SHEET_H * scale;

  // Product dimensions (with bleed)
  const pw = (rotated ? heightCm : widthCm) * scale;
  const ph = (rotated ? widthCm : heightCm) * scale;

  // Utilization color
  const utilColor =
    sheet_utilization_pct >= 80
      ? 'text-emerald-400'
      : sheet_utilization_pct >= 60
        ? 'text-amber-400'
        : 'text-red-400';

  return (
    <Card className="p-4 border-border bg-card/50">
      <div className="flex items-start gap-4">
        {/* Visual sheet preview */}
        <div className="shrink-0">
          <div
            className="relative border-2 border-primary/30 rounded bg-primary/5"
            style={{ width: sw, height: sh }}
          >
            {Array.from({ length: rows }).map((_, r) =>
              Array.from({ length: cols }).map((_, c) => (
                <div
                  key={`${r}-${c}`}
                  className="absolute border border-primary/40 bg-primary/15 rounded-[2px]"
                  style={{
                    left: c * pw,
                    top: r * ph,
                    width: pw - 1,
                    height: ph - 1,
                  }}
                />
              ))
            )}
            {/* Label */}
            <div className="absolute bottom-1 right-1 text-[9px] text-primary/60 font-mono">
              70×100 cm
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-sm font-bold text-foreground flex items-center gap-2">
              {poses_per_sheet} poses/pliego
              {rotated && (
                <span className="text-[10px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded font-medium">
                  ↻ Rotado
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {cols} cols × {rows} filas
            </p>
          </div>

          <div className="space-y-1.5">
            {/* Utilization bar */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-20">Utilización:</span>
              <div className="flex-1 bg-muted rounded-full h-2">
                <div
                  className={cn(
                    'h-2 rounded-full transition-all',
                    sheet_utilization_pct >= 80
                      ? 'bg-emerald-400'
                      : sheet_utilization_pct >= 60
                        ? 'bg-amber-400'
                        : 'bg-red-400'
                  )}
                  style={{ width: `${Math.min(sheet_utilization_pct, 100)}%` }}
                />
              </div>
              <span className={cn('text-xs font-bold w-12 text-right', utilColor)}>
                {sheet_utilization_pct}%
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Desperdicio:</span>
              <span className="text-foreground font-medium">{waste_pct}%</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Pliegos necesarios:</span>
              <span className="text-foreground font-bold">{sheets_needed.toLocaleString()}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Tamaño pieza:</span>
              <span className="text-foreground font-medium">
                {widthCm}×{heightCm} cm
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
