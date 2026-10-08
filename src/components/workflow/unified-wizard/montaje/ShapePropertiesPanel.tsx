'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RotateCw, Trash2 } from 'lucide-react';
import type { MontajeShape } from '@/types/ot-unified';

export function ShapePropertiesPanel({
  selectedShape,
  updateShape,
  rotateShape,
  removeShape,
}: {
  selectedShape: MontajeShape;
  updateShape: (id: string, patch: Partial<MontajeShape>) => void;
  rotateShape: (id: string) => void;
  removeShape: (id: string) => void;
}) {
  return (
    <Card className="p-3 border-border space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold flex items-center gap-1">
          <div
            className="w-3 h-3 rounded"
            style={{ backgroundColor: selectedShape.color }}
          />
          {selectedShape.label}
        </h4>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => rotateShape(selectedShape.id)}
          >
            <RotateCw className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-destructive"
            onClick={() => removeShape(selectedShape.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-0.5">
          <Label className="text-[10px]">Ancho (mm)</Label>
          <Input
            type="number"
            value={selectedShape.width}
            onChange={(e) =>
              updateShape(selectedShape.id, {
                width: Number(e.target.value),
              })
            }
            className="h-7 text-xs font-mono bg-input border-border"
          />
        </div>
        <div className="space-y-0.5">
          <Label className="text-[10px]">Alto (mm)</Label>
          <Input
            type="number"
            value={selectedShape.height}
            onChange={(e) =>
              updateShape(selectedShape.id, {
                height: Number(e.target.value),
              })
            }
            className="h-7 text-xs font-mono bg-input border-border"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-0.5">
          <Label className="text-[10px]">X (mm)</Label>
          <Input
            type="number"
            value={Math.round(selectedShape.x)}
            onChange={(e) =>
              updateShape(selectedShape.id, {
                x: Number(e.target.value),
              })
            }
            className="h-7 text-xs font-mono bg-input border-border"
          />
        </div>
        <div className="space-y-0.5">
          <Label className="text-[10px]">Y (mm)</Label>
          <Input
            type="number"
            value={Math.round(selectedShape.y)}
            onChange={(e) =>
              updateShape(selectedShape.id, {
                y: Number(e.target.value),
              })
            }
            className="h-7 text-xs font-mono bg-input border-border"
          />
        </div>
      </div>

      <div className="space-y-0.5">
        <Label className="text-[10px]">Sangrado (mm)</Label>
        <Input
          type="number"
          value={selectedShape.bleed}
          onChange={(e) =>
            updateShape(selectedShape.id, {
              bleed: Number(e.target.value),
            })
          }
          className="h-7 text-xs font-mono bg-input border-border"
        />
      </div>

      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Badge variant="outline" className="text-[9px]">
          {selectedShape.shapeType === 'die_cut'
            ? '✂ Troquel'
            : selectedShape.shapeType === 'custom'
              ? '⬡ Custom'
              : selectedShape.shapeType}
        </Badge>
        <span>• Rot: {selectedShape.rotation}°</span>
      </div>
    </Card>
  );
}
