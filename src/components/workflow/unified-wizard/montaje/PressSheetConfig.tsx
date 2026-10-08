'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ZoomIn, ZoomOut } from 'lucide-react';
import type { UnifiedOTForm } from '@/types/ot-unified';

export function PressSheetConfig({
  form,
  updateForm,
  zoom,
  setZoom,
}: {
  form: UnifiedOTForm;
  updateForm: (patch: Partial<UnifiedOTForm>) => void;
  zoom: number;
  setZoom: Dispatch<SetStateAction<number>>;
}) {
  return (
    <Card className="p-3 border-border">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Pliego:</Label>
          <Input
            type="number"
            value={form.press_sheet_width}
            onChange={(e) => updateForm({ press_sheet_width: Number(e.target.value) })}
            className="bg-input border-border h-8 w-20 text-xs font-mono"
          />
          <span className="text-xs text-muted-foreground">×</span>
          <Input
            type="number"
            value={form.press_sheet_height}
            onChange={(e) => updateForm({ press_sheet_height: Number(e.target.value) })}
            className="bg-input border-border h-8 w-20 text-xs font-mono"
          />
          <span className="text-xs text-muted-foreground">mm</span>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Pinza:</Label>
          <Input
            type="number"
            step={0.1}
            value={form.montaje.pinza_cm}
            onChange={(e) =>
              updateForm({
                montaje: { ...form.montaje, pinza_cm: Number(e.target.value) },
              })
            }
            className="bg-input border-border h-8 w-16 text-xs font-mono"
          />
          <span className="text-xs text-muted-foreground">cm</span>
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}>
            <ZoomOut className="h-3 w-3" />
          </Button>
          <span className="text-xs text-muted-foreground w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>
            <ZoomIn className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
