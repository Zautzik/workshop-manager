'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Ship, Truck } from 'lucide-react';
import { STATUS_LABEL } from '@/lib/part-procurement';
import { STATUS_STYLE, CRITICALITY_STYLE, nf, type PartRow } from './types';
import { CrearOrdenButton } from './CrearOrdenButton';

/* ── Una pieza ───────────────────────────────────────────────────────── */

export function PiezaRow({
  part, unitShort, onReplace, replacing,
}: {
  part: PartRow;
  unitShort: string;
  onReplace: () => void;
  replacing: boolean;
}) {
  const style = STATUS_STYLE[part.health.status];
  const Icon = style.icon;
  const pct = part.health.lifeUsedPct;
  const stockBajo =
    part.current_stock != null &&
    part.suggested_min_stock != null &&
    part.current_stock < part.suggested_min_stock;

  return (
    <li className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{part.name}</span>
            {part.part_number && (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {part.part_number}
              </code>
            )}
            <Badge variant="outline" className={CRITICALITY_STYLE[part.criticality] ?? ''}>
              {part.criticality}
            </Badge>
            {part.is_imported && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Ship className="h-3 w-3" /> Importada
              </Badge>
            )}
          </div>

          {(part.position || part.preferred_supplier) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {part.position && <span>{part.position}</span>}
              {part.position && part.preferred_supplier && <span> · </span>}
              {part.preferred_supplier && <span>{part.preferred_supplier}</span>}
              {part.lead_time_days != null && (
                <span> · reposición {part.lead_time_days} días</span>
              )}
            </p>
          )}

          {/* Barra de vida consumida */}
          {pct != null && (
            <div className="mt-2 max-w-sm">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${style.bar}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {pct}% de vida usada
                {part.health.remainingUsage != null && (
                  <> · quedan {nf.format(part.health.remainingUsage)} {unitShort}</>
                )}
              </p>
            </div>
          )}

          <p className="mt-2 text-xs text-muted-foreground">{part.health.reason}</p>

          {stockBajo && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              Stock {part.current_stock} · el plazo de reposición justifica tener{' '}
              {part.suggested_min_stock}.
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {part.on_order ? (
            /* Ya viene en camino: lo que corresponde es esperar, no comprar
               otra vez. El estado de salud se sigue mostrando en el texto. */
            <Badge variant="outline" className="gap-1 border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300">
              <Truck className="h-3 w-3" />
              En camino
            </Badge>
          ) : (
            <Badge variant="outline" className={`gap-1 ${style.badge}`}>
              <Icon className="h-3 w-3" />
              {STATUS_LABEL[part.health.status]}
            </Badge>
          )}
          <CrearOrdenButton part={part} />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onReplace}
            disabled={replacing}
          >
            Cambié esta pieza
          </Button>
        </div>
      </div>
    </li>
  );
}
