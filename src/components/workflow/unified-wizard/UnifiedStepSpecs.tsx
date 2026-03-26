'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Ruler, Palette, Droplets, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PRODUCT_TYPES,
  SUBSTRATE_TYPES,
  GRAMMAGE_OPTIONS,
  COLOR_MODES,
  FINISH_OPTIONS,
} from '@/types/ot';
import type { OTFinishes } from '@/types/ot';
import type { UnifiedOTForm } from '@/types/ot-unified';

interface Props {
  form: UnifiedOTForm;
  updateForm: (patch: Partial<UnifiedOTForm>) => void;
}

export function UnifiedStepSpecs({ form, updateForm }: Props) {
  const [moreFinishes, setMoreFinishes] = useState(false);
  const [newPantone, setNewPantone] = useState('');

  const primaryFinishes = FINISH_OPTIONS.filter((f) => f.primary);
  const secondaryFinishes = FINISH_OPTIONS.filter((f) => !f.primary);

  const toggleFinish = (key: keyof OTFinishes) => {
    updateForm({
      finishes: { ...form.finishes, [key]: !form.finishes[key] },
    });
  };

  const addPantone = () => {
    if (newPantone.trim() && !form.pantone_colors.includes(newPantone.trim())) {
      updateForm({
        pantone_colors: [...form.pantone_colors, newPantone.trim()],
      });
      setNewPantone('');
    }
  };

  const removePantone = (color: string) => {
    updateForm({
      pantone_colors: form.pantone_colors.filter((c) => c !== color),
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold text-foreground flex items-center justify-center gap-2">
          <Ruler className="h-6 w-6 text-primary" />
          Especificaciones del Producto
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Dimensiones, sustrato, colores y terminaciones
        </p>
      </div>

      {/* ── Product Type & Dimensions ──────────────────────────── */}
      <Card className="p-4 border-border space-y-4">
        <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
          <Ruler className="h-4 w-4 text-primary" />
          Formato
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Tipo de Producto</Label>
            <Select
              value={form.product_type || ''}
              onValueChange={(v) => updateForm({ product_type: v })}
            >
              <SelectTrigger className="bg-input border-border">
                <SelectValue placeholder="Seleccionar…" />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_TYPES.map((pt) => (
                  <SelectItem key={pt.value} value={pt.value}>
                    {pt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Ancho (cm) *</Label>
            <Input
              type="number"
              min={0}
              step={0.1}
              value={form.width_cm || ''}
              onChange={(e) => updateForm({ width_cm: Number(e.target.value) })}
              placeholder="21.5"
              className="bg-input border-border font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Alto (cm) *</Label>
            <Input
              type="number"
              min={0}
              step={0.1}
              value={form.height_cm || ''}
              onChange={(e) => updateForm({ height_cm: Number(e.target.value) })}
              placeholder="28"
              className="bg-input border-border font-mono"
            />
          </div>
        </div>

        {/* Quick size reference */}
        {form.width_cm > 0 && form.height_cm > 0 && (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span>📐 Formato cerrado:</span>
            <Badge variant="outline" className="font-mono">
              {form.width_cm} × {form.height_cm} cm
            </Badge>
            <span className="text-muted-foreground/60">
              ({(form.width_cm * form.height_cm).toFixed(1)} cm²)
            </span>
          </div>
        )}
      </Card>

      {/* ── Substrate ──────────────────────────────────────────── */}
      <Card className="p-4 border-border space-y-4">
        <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
          <Droplets className="h-4 w-4 text-primary" />
          Sustrato / Papel
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Tipo</Label>
            <Select
              value={form.substrate_type || ''}
              onValueChange={(v) => updateForm({ substrate_type: v as any })}
            >
              <SelectTrigger className="bg-input border-border">
                <SelectValue placeholder="Seleccionar…" />
              </SelectTrigger>
              <SelectContent>
                {SUBSTRATE_TYPES.map((st) => (
                  <SelectItem key={st.value} value={st.value}>
                    {st.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Gramaje (g/m²)</Label>
            <Select
              value={String(form.grammage_gsm)}
              onValueChange={(v) => updateForm({ grammage_gsm: Number(v) })}
            >
              <SelectTrigger className="bg-input border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRAMMAGE_OPTIONS.map((g) => (
                  <SelectItem key={g} value={String(g)}>
                    {g} g/m²
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Marca</Label>
            <Input
              placeholder="Marca de papel"
              value={form.substrate_brand}
              onChange={(e) => updateForm({ substrate_brand: e.target.value })}
              className="bg-input border-border"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Proveedor</Label>
            <Input
              placeholder="Proveedor"
              value={form.substrate_supplier}
              onChange={(e) =>
                updateForm({ substrate_supplier: e.target.value })
              }
              className="bg-input border-border"
            />
          </div>
        </div>
      </Card>

      {/* ── Colors ─────────────────────────────────────────────── */}
      <Card className="p-4 border-border space-y-4">
        <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          Colores
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Tiro (Frente)</Label>
            <div className="grid grid-cols-3 gap-2">
              {COLOR_MODES.map((cm) => (
                <button
                  key={cm.value}
                  type="button"
                  onClick={() => updateForm({ color_front: cm.value })}
                  className={cn(
                    'rounded-lg border-2 p-2 text-xs text-center transition-all',
                    form.color_front === cm.value
                      ? 'border-primary bg-primary/10 text-foreground font-bold'
                      : 'border-muted hover:border-muted-foreground/30 text-muted-foreground'
                  )}
                >
                  {cm.icon && <div className="text-[10px] mb-0.5">{cm.icon}</div>}
                  {cm.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Retiro (Reverso)</Label>
            <div className="grid grid-cols-3 gap-2">
              {COLOR_MODES.map((cm) => (
                <button
                  key={cm.value}
                  type="button"
                  onClick={() => updateForm({ color_back: cm.value })}
                  className={cn(
                    'rounded-lg border-2 p-2 text-xs text-center transition-all',
                    form.color_back === cm.value
                      ? 'border-primary bg-primary/10 text-foreground font-bold'
                      : 'border-muted hover:border-muted-foreground/30 text-muted-foreground'
                  )}
                >
                  {cm.icon && <div className="text-[10px] mb-0.5">{cm.icon}</div>}
                  {cm.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Color notation badge */}
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="secondary" className="font-mono text-xs">
            {COLOR_MODES.find((c) => c.value === form.color_front)?.label ?? '?'} /{' '}
            {COLOR_MODES.find((c) => c.value === form.color_back)?.label ?? '?'}
          </Badge>
          {(form.color_front === 'cmyk_pantone' || form.color_back === 'cmyk_pantone') && (
            <span className="text-muted-foreground">+ colores especiales</span>
          )}
        </div>

        {/* Pantone colors */}
        {(form.color_front === 'cmyk_pantone' || form.color_back === 'cmyk_pantone') && (
          <div className="space-y-2">
            <Label className="text-xs">Colores Pantone</Label>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Ej: Pantone 186 C"
                value={newPantone}
                onChange={(e) => setNewPantone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addPantone()}
                className="bg-input border-border flex-1"
              />
              <Button size="sm" variant="outline" onClick={addPantone}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            {form.pantone_colors.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {form.pantone_colors.map((color) => (
                  <Badge
                    key={color}
                    variant="secondary"
                    className="gap-1 cursor-pointer hover:bg-destructive/20"
                    onClick={() => removePantone(color)}
                  >
                    {color}
                    <X className="h-2.5 w-2.5" />
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── Finishes ───────────────────────────────────────────── */}
      <Card className="p-4 border-border space-y-4">
        <h3 className="font-semibold text-sm text-foreground">Terminaciones</h3>

        {/* Primary finishes */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {primaryFinishes.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => toggleFinish(f.key)}
              className={cn(
                'rounded-lg border-2 p-2.5 text-xs text-center transition-all',
                form.finishes[f.key]
                  ? 'border-primary bg-primary/10 text-foreground font-bold'
                  : 'border-muted hover:border-muted-foreground/30 text-muted-foreground'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Secondary finishes (collapsible) */}
        <Collapsible open={moreFinishes} onOpenChange={setMoreFinishes}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground text-xs">
              <ChevronDown
                className={cn(
                  'h-3 w-3 mr-1 transition-transform',
                  moreFinishes && 'rotate-180'
                )}
              />
              {moreFinishes ? 'Menos' : 'Más terminaciones'}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {secondaryFinishes.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => toggleFinish(f.key)}
                  className={cn(
                    'rounded-lg border-2 p-2.5 text-xs text-center transition-all',
                    form.finishes[f.key]
                      ? 'border-primary bg-primary/10 text-foreground font-bold'
                      : 'border-muted hover:border-muted-foreground/30 text-muted-foreground'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Active finishes summary */}
        {Object.values(form.finishes).some(Boolean) && (
          <div className="flex flex-wrap gap-1">
            {FINISH_OPTIONS.filter((f) => form.finishes[f.key]).map((f) => (
              <Badge key={f.key} variant="secondary" className="text-[10px]">
                ✓ {f.label}
              </Badge>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
