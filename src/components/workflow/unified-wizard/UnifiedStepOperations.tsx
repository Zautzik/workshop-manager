'use client';

import { useState, useMemo } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DollarSign,
  Plus,
  Pencil,
  Trash2,
  Calculator,
  RefreshCw,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  OPERATION_CATEGORIES,
  type OTOperation,
  type OTOperationCategory,
} from '@/types/ot';
import {
  computeOTPricing,
  generateDefaultOperations,
  computeOTCalculations,
} from '@/lib/ot-calculations';
import type { UnifiedOTForm } from '@/types/ot-unified';

interface Props {
  form: UnifiedOTForm;
  updateForm: (patch: Partial<UnifiedOTForm>) => void;
}

export function UnifiedStepOperations({ form, updateForm }: Props) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingOp, setEditingOp] = useState<Partial<OTOperation> | null>(null);

  /* ── Operations grouped by category ─────────────────────────── */
  const groupedOps = useMemo(() => {
    const groups: Record<string, OTOperation[]> = {};
    for (const cat of OPERATION_CATEGORIES) {
      groups[cat.value] = form.operations.filter((o) => o.category === cat.value);
    }
    return groups;
  }, [form.operations]);

  /* ── Recalculate pricing when operations change ─────────────── */
  const recalcPricing = (ops: OTOperation[]) => {
    const pricing = computeOTPricing(
      ops,
      form.quantity,
      form.pricing.margin_pct,
      form.pricing.increment_pct,
      form.pricing.commission_pct
    );
    updateForm({ operations: ops, pricing });
  };

  /* ── Re-generate operations from calcs ──────────────────────── */
  const regenerateOps = () => {
    const calcInput = {
      client_name: form.client_name,
      client_id: form.client_id,
      product_name: form.product_name,
      quantity: form.quantity,
      deadline: form.deadline,
      priority_level: form.priority_level,
      description: form.description,
      template_id: form.template_id,
      product_type: form.product_type as any || '',
      width_cm: form.width_cm,
      height_cm: form.height_cm,
      substrate_type: form.substrate_type,
      grammage_gsm: form.grammage_gsm,
      substrate_brand: form.substrate_brand,
      substrate_supplier: form.substrate_supplier,
      color_front: form.color_front,
      color_back: form.color_back,
      pantone_colors: form.pantone_colors,
      finishes: form.finishes,
      attachments: [] as File[],
      calculations: form.calculations,
      imposition: form.imposition,
      operations: [],
      pricing: form.pricing,
      extra_quantities: form.extra_quantities,
    };

    const calcs = computeOTCalculations(calcInput);
    const ops = generateDefaultOperations(calcInput, calcs);
    const pricing = computeOTPricing(
      ops,
      form.quantity,
      form.pricing.margin_pct,
      form.pricing.increment_pct,
      form.pricing.commission_pct
    );
    updateForm({ calculations: calcs, operations: ops, pricing });
  };

  /* ── Edit operation dialog ──────────────────────────────────── */
  const openEditDialog = (op?: OTOperation) => {
    setEditingOp(
      op
        ? { ...op }
        : {
            id: crypto.randomUUID(),
            category: 'otros',
            name: '',
            unit: 'und',
            quantity: 1,
            unit_cost: 0,
            total_cost: 0,
            sort_order: form.operations.length,
          }
    );
    setShowEditDialog(true);
  };

  const saveOp = () => {
    if (!editingOp || !editingOp.name?.trim()) return;
    const total = Number(
      Math.round((editingOp.quantity || 0) * (editingOp.unit_cost || 0))
    );
    const fullOp: OTOperation = {
      id: editingOp.id || crypto.randomUUID(),
      category: (editingOp.category as OTOperationCategory) || 'otros',
      name: editingOp.name || '',
      unit: editingOp.unit || 'und',
      quantity: editingOp.quantity || 0,
      unit_cost: editingOp.unit_cost || 0,
      total_cost: total,
      sort_order: editingOp.sort_order ?? form.operations.length,
    };

    const exists = form.operations.find((o) => o.id === fullOp.id);
    const newOps = exists
      ? form.operations.map((o) => (o.id === fullOp.id ? fullOp : o))
      : [...form.operations, fullOp];

    recalcPricing(newOps);
    setShowEditDialog(false);
  };

  const removeOp = (id: string) => {
    recalcPricing(form.operations.filter((o) => o.id !== id));
  };

  /* ── Update pricing margin/increment/commission ─────────────── */
  const updatePricingField = (field: string, value: number) => {
    const newPricing = { ...form.pricing, [field]: value };
    const recalculated = computeOTPricing(
      form.operations,
      form.quantity,
      field === 'margin_pct' ? value : newPricing.margin_pct,
      field === 'increment_pct' ? value : newPricing.increment_pct,
      field === 'commission_pct' ? value : newPricing.commission_pct
    );
    updateForm({ pricing: recalculated });
  };

  /* ── Render calc stats ──────────────────────────────────────── */
  const calcs = form.calculations;

  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold text-foreground flex items-center justify-center gap-2">
          <DollarSign className="h-6 w-6 text-primary" />
          Costos y Cotización
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Operaciones de producción, márgenes y precio final
        </p>
      </div>

      {/* ── Auto-calculated materials ──────────────────────────── */}
      <Card className="p-4 border-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            Cálculos Automáticos
          </h3>
          <Button size="sm" variant="outline" onClick={regenerateOps}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Recalcular
          </Button>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { label: 'Pliegos', value: calcs.calc_sheets, unit: '' },
            { label: 'Papel', value: calcs.calc_substrate_kg, unit: 'kg' },
            { label: 'Tinta', value: calcs.calc_ink_kg, unit: 'kg' },
            { label: 'Placas', value: calcs.calc_plates, unit: '' },
            { label: 'Hrs Impresión', value: calcs.calc_print_hours, unit: 'h' },
            { label: 'Hrs Terminac.', value: calcs.calc_finish_hours, unit: 'h' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-muted/30 rounded-lg p-2 text-center"
            >
              <div className="text-lg font-bold text-foreground">
                {stat.value.toLocaleString()}
                {stat.unit && (
                  <span className="text-xs text-muted-foreground ml-0.5">
                    {stat.unit}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Operations list ────────────────────────────────────── */}
      <Card className="p-4 border-border space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            Operaciones
          </h3>
          <Button size="sm" onClick={() => openEditDialog()}>
            <Plus className="h-3 w-3 mr-1" />
            Agregar
          </Button>
        </div>

        {form.operations.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground mb-2">
              Sin operaciones. Haga clic en &quot;Recalcular&quot; o agregue manualmente.
            </p>
            <Button variant="outline" size="sm" onClick={regenerateOps}>
              <RefreshCw className="h-3 w-3 mr-1" />
              Generar Automáticas
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {OPERATION_CATEGORIES.map((cat) => {
              const ops = groupedOps[cat.value];
              if (!ops || ops.length === 0) return null;

              return (
                <div key={cat.value}>
                  <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                    {cat.label}
                  </div>
                  <div className="space-y-1">
                    {ops.map((op) => (
                      <div
                        key={op.id}
                        className="flex items-center gap-2 bg-muted/20 rounded-lg px-3 py-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {op.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {op.quantity} {op.unit} × ${op.unit_cost.toLocaleString()}
                          </div>
                        </div>
                        <div className="text-right font-bold text-sm whitespace-nowrap">
                          ${op.total_cost.toLocaleString()}
                        </div>
                        <div className="flex gap-0.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => openEditDialog(op)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-destructive"
                            onClick={() => removeOp(op.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Pricing breakdown ──────────────────────────────────── */}
      <Card className="p-4 border-border space-y-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          Desglose de Precios
        </h3>

        <div className="space-y-3">
          {/* Subtotal */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-bold">${form.pricing.subtotal.toLocaleString()}</span>
          </div>

          {/* Margin */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground w-24">Margen:</span>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.pricing.margin_pct}
              onChange={(e) =>
                updatePricingField('margin_pct', Number(e.target.value))
              }
              className="bg-input border-border h-8 w-20 text-sm font-mono"
            />
            <span className="text-xs text-muted-foreground">%</span>
            <span className="ml-auto text-sm font-medium">
              +${form.pricing.margin_amount.toLocaleString()}
            </span>
          </div>

          {/* Increment */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground w-24">Incremento:</span>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.pricing.increment_pct}
              onChange={(e) =>
                updatePricingField('increment_pct', Number(e.target.value))
              }
              className="bg-input border-border h-8 w-20 text-sm font-mono"
            />
            <span className="text-xs text-muted-foreground">%</span>
            <span className="ml-auto text-sm font-medium">
              +${form.pricing.increment_amount.toLocaleString()}
            </span>
          </div>

          {/* Commission */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground w-24">Comisión:</span>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.pricing.commission_pct}
              onChange={(e) =>
                updatePricingField('commission_pct', Number(e.target.value))
              }
              className="bg-input border-border h-8 w-20 text-sm font-mono"
            />
            <span className="text-xs text-muted-foreground">%</span>
            <span className="ml-auto text-sm font-medium">
              +${form.pricing.commission_amount.toLocaleString()}
            </span>
          </div>

          {/* Total */}
          <div className="border-t border-border pt-3 flex items-center justify-between">
            <span className="text-lg font-bold text-foreground">Total</span>
            <span className="text-2xl font-bold text-primary">
              ${form.pricing.total_price.toLocaleString()}
            </span>
          </div>

          {/* Unit price */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Precio unitario ({form.quantity.toLocaleString()} unidades)
            </span>
            <span className="font-bold">
              ${form.pricing.unit_price.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 4,
              })}
            </span>
          </div>
        </div>
      </Card>

      {/* ── Edit Operation Dialog ──────────────────────────────── */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingOp?.id && form.operations.find((o) => o.id === editingOp.id)
                ? 'Editar Operación'
                : 'Nueva Operación'}
            </DialogTitle>
          </DialogHeader>

          {editingOp && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Categoría</Label>
                <Select
                  value={editingOp.category || 'otros'}
                  onValueChange={(v) =>
                    setEditingOp({ ...editingOp, category: v as OTOperationCategory })
                  }
                >
                  <SelectTrigger className="bg-input border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATION_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Nombre</Label>
                <Input
                  value={editingOp.name || ''}
                  onChange={(e) =>
                    setEditingOp({ ...editingOp, name: e.target.value })
                  }
                  placeholder="Nombre de la operación"
                  className="bg-input border-border"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Cantidad</Label>
                  <Input
                    type="number"
                    value={editingOp.quantity || ''}
                    onChange={(e) =>
                      setEditingOp({
                        ...editingOp,
                        quantity: Number(e.target.value),
                      })
                    }
                    className="bg-input border-border font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Unidad</Label>
                  <Input
                    value={editingOp.unit || 'und'}
                    onChange={(e) =>
                      setEditingOp({ ...editingOp, unit: e.target.value })
                    }
                    className="bg-input border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Costo Unit.</Label>
                  <Input
                    type="number"
                    value={editingOp.unit_cost || ''}
                    onChange={(e) =>
                      setEditingOp({
                        ...editingOp,
                        unit_cost: Number(e.target.value),
                      })
                    }
                    className="bg-input border-border font-mono"
                  />
                </div>
              </div>

              <div className="text-right text-sm">
                Total:{' '}
                <span className="font-bold">
                  $
                  {(
                    (editingOp.quantity || 0) * (editingOp.unit_cost || 0)
                  ).toLocaleString()}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
            >
              Cancelar
            </Button>
            <Button onClick={saveOp} disabled={!editingOp?.name?.trim()}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
