'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Scissors, Wand2 } from 'lucide-react';
import { CUT_PRESETS } from './constants';
import type { NewShapeState } from './AddShapeDialog';

export function DieCutDialog({
  open,
  onOpenChange,
  newShape,
  setNewShape,
  onSelectPreset,
  onAddCustom,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newShape: NewShapeState;
  setNewShape: (value: NewShapeState) => void;
  onSelectPreset: (preset: { name: string; path: string; desc: string }) => void;
  onAddCustom: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Troqueles Especiales
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Seleccione un troquel predefinido o ingrese un SVG path personalizado.
          </p>

          {/* Presets */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CUT_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => onSelectPreset(preset)}
                className="rounded-lg border-2 border-muted p-3 text-left hover:border-primary/50 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-3">
                  <svg viewBox="0 0 100 100" className="w-12 h-12 flex-shrink-0">
                    <path
                      d={preset.path}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      className="text-primary"
                    />
                  </svg>
                  <div>
                    <div className="font-semibold text-sm">{preset.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {preset.desc}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Custom SVG path */}
          <div className="space-y-2 border-t border-border pt-3">
            <Label className="text-xs font-semibold flex items-center gap-1">
              <Wand2 className="h-3.5 w-3.5" />
              SVG Path Personalizado
            </Label>
            <Textarea
              placeholder='M 0 0 L 100 0 L 100 100 L 0 100 Z'
              value={newShape.customPath}
              onChange={(e) =>
                setNewShape({ ...newShape, customPath: e.target.value })
              }
              className="bg-input border-border min-h-[60px] font-mono text-xs"
            />
            <Button
              size="sm"
              disabled={!newShape.customPath.trim()}
              onClick={onAddCustom}
            >
              <Plus className="h-3 w-3 mr-1" />
              Agregar Forma Custom
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
