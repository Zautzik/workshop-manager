'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Ruler, Layers, Palette, Sparkles, ChevronDown, Plus, X, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OTFormData, OTProductType, OTSubstrateType, OTColorMode, OTFinishes } from '@/types/ot';
import {
  PRODUCT_TYPES,
  SUBSTRATE_TYPES,
  GRAMMAGE_OPTIONS,
  COLOR_MODES,
  FINISH_OPTIONS,
} from '@/types/ot';
import { ArtworkUpload } from './ArtworkUpload';

interface Props {
  form: OTFormData;
  updateForm: (patch: Partial<OTFormData>) => void;
}

/* ─── Finish chip icon mapping ──────────────────────────────── */
const FINISH_ICONS: Record<string, string> = {
  finish_troquelado: '✂',
  finish_plegado: '📐',
  finish_pegado: '🧴',
  finish_laminado: '🛡',
  finish_barniz: '✨',
  finish_relieve: '💎',
  finish_perforado: '🔘',
  finish_hot_stamping: '🔥',
  finish_uv_localizado: '☀',
  finish_numeracion: '🔢',
};

export function OTStepSpecifications({ form, updateForm }: Props) {
  const [showMoreFinishes, setShowMoreFinishes] = useState(false);
  const [newPantone, setNewPantone] = useState('');
  const [showBrandSupplier, setShowBrandSupplier] = useState(
    !!(form.substrate_brand || form.substrate_supplier)
  );

  const toggleFinish = (key: keyof OTFinishes) => {
    updateForm({
      finishes: { ...form.finishes, [key]: !form.finishes[key] },
    });
  };

  const addPantone = () => {
    const val = newPantone.trim();
    if (val && !form.pantone_colors.includes(val)) {
      updateForm({ pantone_colors: [...form.pantone_colors, val] });
    }
    setNewPantone('');
  };

  const removePantone = (color: string) => {
    updateForm({ pantone_colors: form.pantone_colors.filter((c) => c !== color) });
  };

  const primaryFinishes = FINISH_OPTIONS.filter((f) => f.primary);
  const secondaryFinishes = FINISH_OPTIONS.filter((f) => !f.primary);

  return (
    <div className="space-y-2">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-foreground">Especificaciones Técnicas</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Define las dimensiones, materiales y acabados
        </p>
      </div>

      <div className="space-y-6 max-w-xl mx-auto">
        {/* ─── Dimensions ───────────────────────────────── */}
        <section className="border border-border rounded-lg p-4 space-y-4 bg-card/50">
          <div className="flex items-center gap-2 text-primary">
            <Ruler className="h-4 w-4" />
            <h3 className="font-semibold text-sm">Dimensiones</h3>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-foreground text-xs">Tipo de Producto</Label>
              <Select
                value={form.product_type || undefined}
                onValueChange={(v) => updateForm({ product_type: v as OTProductType })}
              >
                <SelectTrigger className="bg-input border-border mt-1">
                  <SelectValue placeholder="Seleccionar..." />
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-foreground text-xs">Ancho (cm)</Label>
                <div className="flex items-center gap-1 mt-1">
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    value={form.width_cm || ''}
                    onChange={(e) => updateForm({ width_cm: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="bg-input border-border"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">cm</span>
                </div>
              </div>
              <div>
                <Label className="text-foreground text-xs">Alto (cm)</Label>
                <div className="flex items-center gap-1 mt-1">
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    value={form.height_cm || ''}
                    onChange={(e) => updateForm({ height_cm: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="bg-input border-border"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">cm</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Substrate ────────────────────────────────── */}
        <section className="border border-border rounded-lg p-4 space-y-4 bg-card/50">
          <div className="flex items-center gap-2 text-primary">
            <Layers className="h-4 w-4" />
            <h3 className="font-semibold text-sm">Sustrato</h3>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-foreground text-xs">Tipo</Label>
              <Select
                value={form.substrate_type || undefined}
                onValueChange={(v) => updateForm({ substrate_type: v as OTSubstrateType })}
              >
                <SelectTrigger className="bg-input border-border mt-1">
                  <SelectValue placeholder="Seleccionar..." />
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

            <div>
              <Label className="text-foreground text-xs">Gramaje (g/m²)</Label>
              <Select
                value={String(form.grammage_gsm)}
                onValueChange={(v) => updateForm({ grammage_gsm: parseInt(v) })}
              >
                <SelectTrigger className="bg-input border-border mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRAMMAGE_OPTIONS.map((g) => (
                    <SelectItem key={g} value={String(g)}>
                      {g} gsm
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Brand/Supplier toggle */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-primary text-xs gap-1 p-0 h-auto"
              onClick={() => setShowBrandSupplier(!showBrandSupplier)}
            >
              <Plus className="h-3 w-3" />
              Marca/Proveedor
            </Button>
            {showBrandSupplier && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-foreground text-xs">Marca</Label>
                  <Input
                    value={form.substrate_brand}
                    onChange={(e) => updateForm({ substrate_brand: e.target.value })}
                    className="bg-input border-border mt-1"
                    placeholder="Marca..."
                  />
                </div>
                <div>
                  <Label className="text-foreground text-xs">Proveedor</Label>
                  <Input
                    value={form.substrate_supplier}
                    onChange={(e) => updateForm({ substrate_supplier: e.target.value })}
                    className="bg-input border-border mt-1"
                    placeholder="Proveedor..."
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ─── Colors ───────────────────────────────────── */}
        <section className="border border-border rounded-lg p-4 space-y-4 bg-card/50">
          <div className="flex items-center gap-2 text-primary">
            <Palette className="h-4 w-4" />
            <h3 className="font-semibold text-sm">Colores</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-foreground text-xs">Tiro (Frente)</Label>
              <Select
                value={form.color_front}
                onValueChange={(v) => updateForm({ color_front: v as OTColorMode })}
              >
                <SelectTrigger className="bg-input border-border mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLOR_MODES.map((cm) => (
                    <SelectItem key={cm.value} value={cm.value}>
                      <span className="flex items-center gap-2">
                        {cm.icon && <span className="text-xs">{cm.icon}</span>}
                        {cm.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-foreground text-xs">Retiro (Reverso)</Label>
              <Select
                value={form.color_back}
                onValueChange={(v) => updateForm({ color_back: v as OTColorMode })}
              >
                <SelectTrigger className="bg-input border-border mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLOR_MODES.map((cm) => (
                    <SelectItem key={cm.value} value={cm.value}>
                      <span className="flex items-center gap-2">
                        {cm.icon && <span className="text-xs">{cm.icon}</span>}
                        {cm.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Pantone colors */}
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-primary text-xs gap-1 p-0 h-auto"
              onClick={() => {
                const input = document.getElementById('pantone-input');
                if (input) (input as HTMLInputElement).focus();
              }}
            >
              <Plus className="h-3 w-3" />
              Colores especiales (Pantone)
            </Button>
            <div className="flex flex-wrap gap-2 mt-2">
              {form.pantone_colors.map((color) => (
                <span
                  key={color}
                  className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-full border border-primary/20"
                >
                  {color}
                  <button type="button" onClick={() => removePantone(color)}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <div className="flex items-center gap-1">
                <Input
                  id="pantone-input"
                  value={newPantone}
                  onChange={(e) => setNewPantone(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPantone())}
                  placeholder="Pantone 485 C"
                  className="bg-input border-border h-7 text-xs w-32"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={addPantone}
                  disabled={!newPantone.trim()}
                >
                  Agregar
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Finishes ─────────────────────────────────── */}
        <section className="border border-border rounded-lg p-4 space-y-4 bg-card/50">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-4 w-4" />
            <h3 className="font-semibold text-sm">Terminaciones</h3>
          </div>

          {/* Primary finishes grid */}
          <div className="grid grid-cols-3 gap-2">
            {primaryFinishes.map((f) => {
              const active = form.finishes[f.key];
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => toggleFinish(f.key)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border',
                    active
                      ? 'bg-primary/15 text-primary border-primary/40'
                      : 'bg-input text-muted-foreground border-border hover:border-primary/30'
                  )}
                >
                  <span>{FINISH_ICONS[f.key]}</span>
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Secondary finishes */}
          <Collapsible open={showMoreFinishes} onOpenChange={setShowMoreFinishes}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground text-xs gap-1 w-full"
              >
                <ChevronDown
                  className={cn('h-3 w-3 transition-transform', showMoreFinishes && 'rotate-180')}
                />
                Ver más
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              {secondaryFinishes.map((f) => {
                const active = form.finishes[f.key];
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => toggleFinish(f.key)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border',
                      active
                        ? 'bg-primary/15 text-primary border-primary/40'
                        : 'bg-input text-muted-foreground border-border hover:border-primary/30'
                    )}
                  >
                    <span>{FINISH_ICONS[f.key]}</span>
                    {f.label}
                  </button>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        </section>

        {/* ─── Artwork Attachments ──────────────────────── */}
        <section className="border border-border rounded-lg p-4 space-y-4 bg-card/50">
          <div className="flex items-center gap-2 text-primary">
            <Paperclip className="h-4 w-4" />
            <h3 className="font-semibold text-sm">Archivos de Arte</h3>
          </div>
          <ArtworkUpload
            files={form.attachments}
            onFilesChange={(files) => updateForm({ attachments: files })}
          />
        </section>
      </div>
    </div>
  );
}
