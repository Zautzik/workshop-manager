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
  computeMultiQuantityQuotes,
} from '@/lib/ot-calculations';
import { resolveCostOverrides } from '@/lib/costing-resolver';
import { useCostCatalog, useMaterialCost } from '@/hooks/use-cost-catalog';
import { useMachines } from '@/hooks/use-machines';
import { formatCLP } from '@/lib/format';
import type { UnifiedOTForm } from '@/types/ot-unified';
import type { OTFormData } from '@/types/ot';

interface Props {
  form: UnifiedOTForm;
  updateForm: (patch: Partial<UnifiedOTForm>) => void;
}

export function UnifiedStepOperations({ form, updateForm }: Props) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingOp, setEditingOp] = useState<Partial<OTOperation> | null>(null);
  // Real rates for the estimate: shared DB catalog + purchase-weighted material cost.
  const { data: catalog = [] } = useCostCatalog();
  const { data: materialCost = [] } = useMaterialCost();
  // La prensa asignada, para que "¿Y si lleva más?" respete el mismo límite
  // de pliego que el resto de la pantalla — ver más abajo por qué hace falta.
  const { data: machines = [] } = useMachines();
  const assignedPress = useMemo(
    () => (machines as any[]).find((m) => m.id === form.machine.machine_id) ?? null,
    [machines, form.machine.machine_id],
  );
  // Memoizado, no un literal recalculado cada render: un objeto nuevo en cada
  // pasada invalidaría el useMemo de `quantityBreaks` de abajo aunque nada
  // real hubiera cambiado.
  const pressLimit = useMemo(
    () =>
      assignedPress
        ? {
            maxWidthCm: assignedPress.max_print_width_mm ? assignedPress.max_print_width_mm / 10 : 37,
            maxHeightCm: assignedPress.max_print_height_mm ? assignedPress.max_print_height_mm / 10 : 52,
          }
        : null,
    [assignedPress],
  );

  /* ── Operations grouped by category ─────────────────────────── */
  /**
   * Un impresor nunca cotiza un solo número: el cliente siempre pregunta "¿y si
   * llevo más?". Se ofrecen la cantidad pedida más la mitad y el doble/quíntuple,
   * calculadas de nuevo con el motor completo — el alistamiento se amortiza solo
   * porque el modelo lo trata como costo por pasada, no por unidad.
   */
  const currentUnit = form.pricing.unit_price;

  const quantityBreaks = useMemo(() => {
    const base = form.quantity;
    if (!(base > 0) || !(form.width_cm > 0) || !(form.height_cm > 0)) return [];

    const ladder = [...new Set([
      Math.max(1, Math.round(base / 2)),
      base,
      base * 2,
      base * 5,
    ])].sort((a, b) => a - b);

    const calcInput = {
      quantity: base,
      width_cm: form.width_cm,
      height_cm: form.height_cm,
      grammage_gsm: form.grammage_gsm,
      substrate_type: form.substrate_type,
      color_front: form.color_front,
      color_back: form.color_back,
      finishes: form.finishes,
    } as unknown as OTFormData;

    const overrides = resolveCostOverrides(catalog, {
      color_front: form.color_front,
      color_back: form.color_back,
      substrate_type: form.substrate_type,
      grammage_gsm: form.grammage_gsm,
    }, materialCost);

    const quotes = computeMultiQuantityQuotes(
      calcInput,
      ladder,
      form.pricing.margin_pct,
      form.pricing.increment_pct,
      form.pricing.commission_pct,
      {
        inkCoverage: form.ink_coverage,
        // Sin esto, "¿Y si lleva más?" imponía contra el pliego padre sin
        // restricción en vez del formato real de la prensa asignada — el
        // mismo bug del Run 3 (calc_sheets colapsando a una fracción de lo
        // real), pero en esta tabla en vez del cálculo principal: mostraba,
        // para la MISMA cantidad actual, un total distinto al de "Desglose
        // de Precios" en la sección de arriba de esta misma pantalla
        // (auditoría 2026-09-03, OT 41224: $3.004.948 acá contra $7.162.890
        // en el desglose, ambos para 172.000 unidades).
        pressLimit,
        pressBodies: assignedPress?.colors,
        machineSpeedSheetsHr: assignedPress?.optimal_speed_sheets_hr ?? assignedPress?.nominal_speed_sheets_hr,
      },
      overrides
    );

    // La fila "actual" no simula — muestra el presupuesto que de verdad está
    // guardado. El resto de la escalera SÍ tiene que simular (nadie tiene un
    // presupuesto real para "el doble" todavía), pero para la cantidad de
    // hoy ya existe una respuesta real, y hacer que el motor la recalcule
    // desde cero puede no coincidir con ella — tarifas históricas, líneas
    // editadas a mano, lo que sea que "Desglose de Precios" refleje y una
    // simulación fresca no puede reproducir. Mostrar dos números distintos
    // bajo la misma etiqueta "actual" es peor que mostrar uno solo, aunque
    // ese uno no venga del mismo motor que las demás filas (auditoría
    // 2026-09-04).
    return quotes.map((q) =>
      q.quantity === base
        ? { quantity: base, total_price: Math.round(form.pricing.total_price), unit_price: Math.round(form.pricing.unit_price) }
        : q,
    );
  }, [
    form.quantity, form.width_cm, form.height_cm, form.grammage_gsm,
    form.substrate_type, form.color_front, form.color_back, form.finishes,
    form.ink_coverage, form.pricing.margin_pct, form.pricing.increment_pct,
    form.pricing.commission_pct, form.pricing.total_price, form.pricing.unit_price,
    catalog, materialCost, pressLimit, assignedPress,
  ]);

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
    const costOverrides = resolveCostOverrides(catalog, {
      color_front: form.color_front,
      color_back: form.color_back,
      substrate_type: form.substrate_type,
      grammage_gsm: form.grammage_gsm,
    }, materialCost);
    const ops = generateDefaultOperations(calcInput, calcs, costOverrides);
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
      // Pasa por este diálogo = una persona la escribió o la corrigió. Es lo
      // que hace que un cambio de especificación más adelante la deje
      // intacta en vez de pisarla (reconcileOperations, ot-calculations.ts).
      is_manual: true,
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
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-3 py-2',
                          op._stale
                            ? 'bg-amber-500/10 border border-amber-500/40'
                            : 'bg-muted/20'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate flex items-center gap-1.5">
                            {op.name}
                            {op._stale && (
                              <Badge
                                variant="outline"
                                className="border-amber-500/50 text-amber-600 dark:text-amber-400 text-[10px] px-1.5 py-0 h-4"
                                title={
                                  op._orphaned
                                    ? 'Línea manual: la especificación de hoy ya no pide nada parecido'
                                    : 'Línea manual: no se actualizó sola porque la editaste — revisala'
                                }
                              >
                                {op._orphaned ? 'ya no aplica' : 'revisar'}
                              </Badge>
                            )}
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

      {/* ── Quiebres por cantidad ──────────────────────────────── */}
      {quantityBreaks.length > 0 && (
        <Card className="p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-sm text-foreground">¿Y si lleva más?</h3>
            <p className="text-xs text-muted-foreground">
              El cliente siempre pregunta. El alistamiento se paga una vez, así que a mayor tiraje
              el unitario baja — cada fila se recalcula con el motor completo, no escalando.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 pr-3 font-semibold">Cantidad</th>
                  <th className="py-1.5 px-3 text-right font-semibold">Precio total</th>
                  <th className="py-1.5 px-3 text-right font-semibold">Unitario</th>
                  <th className="py-1.5 pl-3 text-right font-semibold">vs. actual</th>
                </tr>
              </thead>
              <tbody>
                {quantityBreaks.map((q) => {
                  const isCurrent = q.quantity === form.quantity;
                  const deltaPct =
                    currentUnit > 0 ? ((q.unit_price - currentUnit) / currentUnit) * 100 : 0;
                  return (
                    <tr
                      key={q.quantity}
                      className={`border-b border-border last:border-0 ${isCurrent ? 'bg-primary/5' : ''}`}
                    >
                      <td className="py-1.5 pr-3 tabular-nums text-foreground">
                        {q.quantity.toLocaleString('es-CL')}
                        {isCurrent && <span className="ml-1 text-[10px] text-primary">actual</span>}
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-foreground">
                        {formatCLP(q.total_price)}
                      </td>
                      <td className="py-1.5 px-3 text-right font-medium tabular-nums text-foreground">
                        {formatCLP(q.unit_price)}
                      </td>
                      <td
                        className={`py-1.5 pl-3 text-right tabular-nums ${
                          isCurrent
                            ? 'text-muted-foreground'
                            : deltaPct < 0
                              ? 'text-emerald-600'
                              : 'text-amber-600'
                        }`}
                      >
                        {isCurrent ? '—' : `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(0)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

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
