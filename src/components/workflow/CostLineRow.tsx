'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import { OPERATION_CATEGORIES } from '@/types/ot';
import type { RealCostLine } from './RealCostEntryDialog';

export function CostLineRow({
  line,
  idx,
  onUpdate,
  onRemove,
  removeDisabled,
  devColor,
}: {
  line: RealCostLine;
  idx: number;
  onUpdate: (index: number, field: keyof RealCostLine, value: any) => void;
  onRemove: (index: number) => void;
  removeDisabled: boolean;
  devColor: (pct: number) => string;
}) {
  const total = Math.round(line.quantity * line.unit_cost * 100) / 100;
  const estTotal = line._est_total ?? 0;
  const dev = estTotal > 0 ? ((total - estTotal) / estTotal) * 100 : 0;

  return (
    <div
      className={`grid grid-cols-[60px_1fr_120px_90px_80px_100px_100px_36px] gap-2 items-end p-2 rounded-md border ${
        line._is_merma_auto
          ? 'bg-amber-500/10 border-amber-500/40'
          : 'bg-card border-border'
      }`}
    >
      {/* Code */}
      <div>
        <Label className="text-xs text-muted-foreground">Código</Label>
        <Input
          value={line.operation_code}
          onChange={(e) => onUpdate(idx, 'operation_code', e.target.value)}
          className="h-8 text-xs"
        />
      </div>

      {/* Description */}
      <div>
        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          Descripción
          {line._is_merma_auto && (
            <Badge
              variant="outline"
              className={
                line._merma_sin_costo
                  ? 'border-red-500/50 text-red-600 dark:text-red-400 text-[10px] px-1.5 py-0 h-4'
                  : 'border-amber-500/50 text-amber-600 dark:text-amber-400 text-[10px] px-1.5 py-0 h-4'
              }
              title={
                line._merma_sin_costo
                  ? 'Se agregó sola al declarar merma, pero esta OT no tiene presupuesto de papel del cual sacar un costo — completalo a mano'
                  : 'Se agregó sola al declarar merma en el cierre de etapa — revisala'
              }
            >
              {line._merma_sin_costo ? 'merma · sin costo' : 'merma · auto'}
            </Badge>
          )}
        </Label>
        <Input
          value={line.description}
          onChange={(e) => onUpdate(idx, 'description', e.target.value)}
          className="h-8 text-xs"
          placeholder="Nombre del ítem..."
        />
      </div>

      {/* Category */}
      <div>
        <Label className="text-xs text-muted-foreground">Categoría</Label>
        <Select
          value={line.category}
          onValueChange={(v) => onUpdate(idx, 'category', v)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPERATION_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Quantity */}
      <div>
        <Label className="text-xs text-muted-foreground">
          Cant.{' '}
          {line._est_qty !== undefined && (
            <span className="text-muted-foreground/60">({line._est_qty})</span>
          )}
        </Label>
        <Input
          type="number"
          min={0}
          step="any"
          value={line.quantity || ''}
          onChange={(e) => onUpdate(idx, 'quantity', Number(e.target.value))}
          className="h-8 text-xs"
        />
      </div>

      {/* Unit */}
      <div>
        <Label className="text-xs text-muted-foreground">Unidad</Label>
        <Input
          value={line.unit}
          onChange={(e) => onUpdate(idx, 'unit', e.target.value)}
          className="h-8 text-xs"
        />
      </div>

      {/* Unit Cost */}
      <div>
        <Label className="text-xs text-muted-foreground">
          C/U{' '}
          {line._est_unit_cost !== undefined && (
            <span className="text-muted-foreground/60">
              (${line._est_unit_cost.toLocaleString()})
            </span>
          )}
        </Label>
        <Input
          type="number"
          min={0}
          step="any"
          value={line.unit_cost || ''}
          onChange={(e) => onUpdate(idx, 'unit_cost', Number(e.target.value))}
          className="h-8 text-xs"
        />
      </div>

      {/* Total + Deviation */}
      <div>
        <Label className="text-xs text-muted-foreground">Total</Label>
        <div className="h-8 flex flex-col justify-center">
          <span className="text-xs font-medium">${total.toLocaleString()}</span>
          {estTotal > 0 && (
            <span className={`text-[10px] ${devColor(dev)}`}>
              {dev > 0 ? '+' : ''}{Math.round(dev)}%
            </span>
          )}
        </div>
      </div>

      {/* Remove */}
      <div className="flex items-end pb-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
          onClick={() => onRemove(idx)}
          disabled={removeDisabled}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
