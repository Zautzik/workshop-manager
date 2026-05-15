'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, ArrowRight, DollarSign, AlertCircle, SkipForward, Upload, X, Image as ImageIcon } from 'lucide-react';
import { OPERATION_CATEGORIES, type OTOperationCategory } from '@/types/ot';

interface RealCostLine {
  operation_code: string;
  description: string;
  category: OTOperationCategory;
  quantity: number;
  unit: string;
  unit_cost: number;
  notes: string;
  /** For display only — estimated values from budget */
  _est_qty?: number;
  _est_unit?: string;
  _est_unit_cost?: number;
  _est_total?: number;
  _is_budgeted?: boolean;
}

interface BudgetedOperation {
  id: string;
  category: string;
  name: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  sort_order: number;
}

interface RealCostEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ot: {
    id: string;
    ot_number: string;
    client_name: string;
    product_name?: string;
    status: string;
  };
  targetStatus: string;
  targetStatusLabel: string;
  onConfirm: () => void; // called after costs saved + advance
}

export function RealCostEntryDialog({
  open,
  onOpenChange,
  ot,
  targetStatus,
  targetStatusLabel,
  onConfirm,
}: RealCostEntryDialogProps) {
  const { toast } = useToast();
  const [lines, setLines] = useState<RealCostLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const isVistoGood = ot.status === 'visto_bueno';

  // Load budgeted operations as reference
  useEffect(() => {
    if (!open || loaded) return;

    const loadBudget = async () => {
      try {
        const res = await fetch(`/api/ots/${ot.id}/operations`);
        if (!res.ok) {
          setLines([createEmptyLine(1)]);
          setLoaded(true);
          return;
        }
        const ops: BudgetedOperation[] = await res.json();

        if (ops.length === 0) {
          setLines([createEmptyLine(1)]);
        } else {
          setLines(
            ops.map((op, idx) => ({
              operation_code: String(idx + 1).padStart(5, '0'),
              description: op.name,
              category: (op.category as OTOperationCategory) || 'otros',
              quantity: op.quantity,
              unit: op.unit,
              unit_cost: op.unit_cost,
              notes: '',
              _est_qty: op.quantity,
              _est_unit: op.unit,
              _est_unit_cost: op.unit_cost,
              _est_total: op.total_cost,
              _is_budgeted: true,
            }))
          );
        }
        setLoaded(true);
      } catch {
        setLines([createEmptyLine(1)]);
        setLoaded(true);
      }
    };

    loadBudget();
  }, [open, ot.id, loaded]);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setLoaded(false);
      setLines([]);
      setImageFile(null);
      setImagePreview(null);
    }
  }, [open]);

  const createEmptyLine = (idx: number): RealCostLine => ({
    operation_code: String(idx).padStart(5, '0'),
    description: '',
    category: 'otros',
    quantity: 0,
    unit: 'unit',
    unit_cost: 0,
    notes: '',
    _is_budgeted: false,
  });

  const updateLine = useCallback((index: number, field: keyof RealCostLine, value: any) => {
    setLines((prev) => {
      const copy = [...prev];
      (copy[index] as any)[field] = value;
      return copy;
    });
  }, []);

  const addLine = () => {
    setLines((prev) => [...prev, createEmptyLine(prev.length + 1)]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const getLineTotal = (l: RealCostLine) => Math.round(l.quantity * l.unit_cost * 100) / 100;
  const getEstTotal = (l: RealCostLine) => l._est_total ?? 0;
  const grandTotal = lines.reduce((s, l) => s + getLineTotal(l), 0);
  const estGrandTotal = lines.reduce((s, l) => s + getEstTotal(l), 0);
  const overallDev = estGrandTotal > 0 ? ((grandTotal - estGrandTotal) / estGrandTotal) * 100 : 0;

  const handleSkip = async () => {
    if (isVistoGood && imageFile) await uploadImage();
    onConfirm();
    onOpenChange(false);
  };

  const uploadImage = async () => {
    if (!imageFile) return;
    setUploadingImage(true);
    try {
      const form = new FormData();
      form.append('file', imageFile);
      const res = await fetch(`/api/ots/${ot.id}/image`, { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast({ title: 'Error al subir imagen', description: body?.error ?? 'Intente de nuevo', variant: 'destructive' });
      }
    } catch {
      // non-blocking — image upload failure shouldn't block advance
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveAndAdvance = async () => {
    // Validate that at least one line has a description
    const validLines = lines.filter((l) => l.description.trim().length > 0);
    if (validLines.length === 0) {
      toast({
        title: 'Se requiere al menos un ítem',
        description: 'Ingrese al menos una línea de costo o use "Omitir".',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);

    try {
      const payload = {
        workflow_step: ot.status, // Record costs for the CURRENT step (before advancing)
        costs: validLines.map((l) => ({
          operation_code: l.operation_code,
          description: l.description.trim(),
          category: l.category,
          quantity: l.quantity,
          unit: l.unit,
          unit_cost: l.unit_cost,
          notes: l.notes || null,
        })),
      };

      const res = await fetch(`/api/ots/${ot.id}/real-costs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || 'Failed to save costs');
      }

      toast({
        title: 'Costos reales registrados',
        description: `${validLines.length} ítems guardados para ${ot.ot_number}`,
      });

      // Now advance the OT
      if (isVistoGood && imageFile) await uploadImage();
      onConfirm();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: 'Error al guardar costos',
        description: err.message || 'Intente de nuevo',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const devColor = (pct: number) => {
    if (pct > 5) return 'text-red-400';
    if (pct < -5) return 'text-green-400';
    return 'text-muted-foreground';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Registro de Costos Reales — {ot.ot_number}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-4">
            <span>{ot.client_name}</span>
            {ot.product_name && <span>• {ot.product_name}</span>}
            <Badge variant="outline" className="ml-2">
              Paso actual: {ot.status}
            </Badge>
            <ArrowRight className="h-4 w-4" />
            <Badge className="bg-primary text-primary-foreground">{targetStatusLabel}</Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 px-1 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          Registre los costos reales incurridos en esta etapa antes de avanzar la OT. Los valores
          presupuestados se muestran como referencia.
        </div>

        <ScrollArea className="flex-1 max-h-[50vh] pr-2">
          <div className="space-y-3">
            {lines.map((line, idx) => {
              const total = getLineTotal(line);
              const estTotal = getEstTotal(line);
              const dev = estTotal > 0 ? ((total - estTotal) / estTotal) * 100 : 0;

              return (
                <div
                  key={idx}
                  className="grid grid-cols-[60px_1fr_120px_90px_80px_100px_100px_36px] gap-2 items-end p-2 rounded-md bg-card border border-border"
                >
                  {/* Code */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Código</Label>
                    <Input
                      value={line.operation_code}
                      onChange={(e) => updateLine(idx, 'operation_code', e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Descripción</Label>
                    <Input
                      value={line.description}
                      onChange={(e) => updateLine(idx, 'description', e.target.value)}
                      className="h-8 text-xs"
                      placeholder="Nombre del ítem..."
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Categoría</Label>
                    <Select
                      value={line.category}
                      onValueChange={(v) => updateLine(idx, 'category', v)}
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
                      onChange={(e) => updateLine(idx, 'quantity', Number(e.target.value))}
                      className="h-8 text-xs"
                    />
                  </div>

                  {/* Unit */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Unidad</Label>
                    <Input
                      value={line.unit}
                      onChange={(e) => updateLine(idx, 'unit', e.target.value)}
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
                      onChange={(e) => updateLine(idx, 'unit_cost', Number(e.target.value))}
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
                      onClick={() => removeLine(idx)}
                      disabled={lines.length <= 1}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Add line + Totals */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={addLine}>
            <Plus className="h-3 w-3 mr-1" />
            Agregar ítem
          </Button>
          <div className="text-right space-y-0.5">
            {estGrandTotal > 0 && (
              <p className="text-xs text-muted-foreground">
                Presupuestado: <span className="font-medium">${estGrandTotal.toLocaleString()}</span>
              </p>
            )}
            <p className="text-sm font-bold">
              Total Real: <span className="text-primary">${grandTotal.toLocaleString()}</span>
            </p>
            {estGrandTotal > 0 && (
              <p className={`text-xs font-medium ${devColor(overallDev)}`}>
                Desviación: {overallDev > 0 ? '+' : ''}{Math.round(overallDev)}%
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          {isVistoGood && (
            <div className="flex-1 flex items-center gap-3 mr-2">
              <label
                htmlFor="ot-product-image"
                className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground transition-colors border border-border rounded-md px-2.5 py-1.5 hover:border-primary/50"
              >
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview} alt="preview" className="w-6 h-6 object-cover rounded" />
                ) : (
                  <ImageIcon className="w-4 h-4" />
                )}
                {imageFile ? imageFile.name.slice(0, 20) + (imageFile.name.length > 20 ? '…' : '') : 'Foto del producto'}
              </label>
              <input
                id="ot-product-image"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0] ?? null;
                  setImageFile(f);
                  if (f) {
                    const reader = new FileReader();
                    reader.onload = ev => setImagePreview(ev.target?.result as string);
                    reader.readAsDataURL(f);
                  } else {
                    setImagePreview(null);
                  }
                }}
              />
              {imageFile && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-red-400 transition-colors"
                  onClick={() => { setImageFile(null); setImagePreview(null); }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
          <Button
            variant="ghost"
            onClick={handleSkip}
            className="text-muted-foreground"
          >
            <SkipForward className="h-4 w-4 mr-1" />
            Omitir
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSaveAndAdvance}
            disabled={saving}
            className="bg-primary hover:bg-primary/90"
          >
            {saving ? 'Guardando...' : 'Guardar y Avanzar'}
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
