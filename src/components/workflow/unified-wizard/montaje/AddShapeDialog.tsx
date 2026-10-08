'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MontajeShape } from '@/types/ot-unified';
import { SHAPE_TYPES } from './constants';

export interface NewShapeState {
  label: string;
  width: number;
  height: number;
  shapeType: MontajeShape['shapeType'];
  borderRadius: number;
  customPath: string;
  bleed: number;
}

export function AddShapeDialog({
  open,
  onOpenChange,
  newShape,
  setNewShape,
  shapesCount,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newShape: NewShapeState;
  setNewShape: (value: NewShapeState) => void;
  shapesCount: number;
  onAdd: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar Pieza al Montaje</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Etiqueta</Label>
            <Input
              placeholder={`P${shapesCount + 1}`}
              value={newShape.label}
              onChange={(e) =>
                setNewShape({ ...newShape, label: e.target.value })
              }
              className="bg-input border-border"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Ancho (mm)</Label>
              <Input
                type="number"
                value={newShape.width}
                onChange={(e) =>
                  setNewShape({ ...newShape, width: Number(e.target.value) })
                }
                className="bg-input border-border font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Alto (mm)</Label>
              <Input
                type="number"
                value={newShape.height}
                onChange={(e) =>
                  setNewShape({ ...newShape, height: Number(e.target.value) })
                }
                className="bg-input border-border font-mono"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Forma</Label>
            <div className="grid grid-cols-5 gap-2">
              {SHAPE_TYPES.map((st) => (
                <button
                  key={st.value}
                  type="button"
                  onClick={() =>
                    setNewShape({ ...newShape, shapeType: st.value })
                  }
                  className={cn(
                    'rounded-lg border-2 p-2 text-center transition-all text-xs',
                    newShape.shapeType === st.value
                      ? 'border-primary bg-primary/10 font-bold'
                      : 'border-muted hover:border-muted-foreground/30'
                  )}
                >
                  <div className="text-lg">{st.icon}</div>
                  <div className="text-[9px]">{st.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Sangrado (mm)</Label>
            <Input
              type="number"
              value={newShape.bleed}
              onChange={(e) =>
                setNewShape({ ...newShape, bleed: Number(e.target.value) })
              }
              className="bg-input border-border w-24 font-mono"
            />
          </div>

          {newShape.shapeType === 'rounded' && (
            <div className="space-y-1">
              <Label className="text-xs">Radio Borde (mm)</Label>
              <Input
                type="number"
                value={newShape.borderRadius}
                onChange={(e) =>
                  setNewShape({
                    ...newShape,
                    borderRadius: Number(e.target.value),
                  })
                }
                className="bg-input border-border w-24 font-mono"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
