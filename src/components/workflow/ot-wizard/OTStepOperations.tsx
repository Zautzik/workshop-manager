'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
} from '@/components/ui/dialog';
import { Plus, X, Pencil, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OTFormData, OTOperation, OTOperationCategory } from '@/types/ot';
import { OPERATION_CATEGORIES } from '@/types/ot';

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  unit: string;
  current_stock?: number;
  min_stock?: number;
  category?: string;
}

interface Props {
  form: OTFormData;
  updateForm: (patch: Partial<OTFormData>) => void;
  recalcPricing: () => void;
}

export function OTStepOperations({ form, updateForm, recalcPricing }: Props) {
  const [editingOp, setEditingOp] = useState<OTOperation | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [newOp, setNewOp] = useState<Partial<OTOperation>>({
    category: 'materiales',
    name: '',
    unit: 'unit',
    quantity: 1,
    unit_cost: 0,
  });

  // Fetch inventory stock levels once
  useEffect(() => {
    async function loadInventory() {
      try {
        const res = await fetch('/api/inventory/stock');
        if (res.ok) {
          const data = await res.json();
          setInventory(data);
        }
      } catch {
        // inventory module may not be available
      }
    }
    loadInventory();
  }, []);

  // Match an operation name to an inventory item
  const findInventoryMatch = (opName: string): InventoryItem | undefined => {
    const lower = opName.toLowerCase();
    return inventory.find(
      (item) =>
        item.name.toLowerCase().includes(lower) ||
        lower.includes(item.name.toLowerCase()) ||
        item.sku.toLowerCase() === lower
    );
  };

  const removeOperation = (id: string) => {
    const ops = form.operations.filter((op) => op.id !== id);
    updateForm({ operations: ops });
    // Recalc after state update
    setTimeout(recalcPricing, 0);
  };

  const updateOperationQuantity = (id: string, quantity: number) => {
    const ops = form.operations.map((op) => {
      if (op.id !== id) return op;
      return { ...op, quantity, total_cost: Math.round(quantity * op.unit_cost) };
    });
    updateForm({ operations: ops });
    setTimeout(recalcPricing, 0);
  };

  const addOperation = () => {
    if (!newOp.name?.trim()) return;
    const op: OTOperation = {
      id: crypto.randomUUID(),
      category: (newOp.category as OTOperationCategory) || 'otros',
      name: newOp.name!.trim(),
      unit: newOp.unit || 'unit',
      quantity: newOp.quantity || 1,
      unit_cost: newOp.unit_cost || 0,
      total_cost: Math.round((newOp.quantity || 1) * (newOp.unit_cost || 0)),
      sort_order: form.operations.length,
    };
    updateForm({ operations: [...form.operations, op] });
    setNewOp({ category: 'materiales', name: '', unit: 'unit', quantity: 1, unit_cost: 0 });
    setShowAddDialog(false);
    setTimeout(recalcPricing, 0);
  };

  const saveEditedOp = () => {
    if (!editingOp) return;
    const ops = form.operations.map((op) => {
      if (op.id !== editingOp.id) return op;
      return {
        ...editingOp,
        total_cost: Math.round(editingOp.quantity * editingOp.unit_cost),
      };
    });
    updateForm({ operations: ops });
    setEditingOp(null);
    setTimeout(recalcPricing, 0);
  };

  const formatCurrency = (val: number) =>
    `$${val.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const getCategoryLabel = (cat: OTOperationCategory) =>
    OPERATION_CATEGORIES.find((c) => c.value === cat)?.label || cat;

  return (
    <div className="space-y-2">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-foreground">Operaciones</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Detalle de costos por operación
        </p>
      </div>

      <div className="max-w-xl mx-auto space-y-3">
        {form.operations.map((op) => {
          const inv = op.category === 'materiales' ? findInventoryMatch(op.name) : undefined;
          const stockOk = inv && typeof inv.current_stock === 'number' && inv.current_stock >= op.quantity;
          const stockLow = inv && typeof inv.current_stock === 'number' && inv.current_stock < op.quantity;

          return (
          <Card
            key={op.id}
            className="p-4 bg-card border-border hover:border-primary/30 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {/* Category / Name */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{getCategoryLabel(op.category)}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="font-semibold text-foreground">{op.name}</span>
                </div>
                {/* Quantity × unit cost */}
                <p className="text-xs text-muted-foreground mt-1">
                  {op.quantity.toLocaleString()} {op.unit} × {formatCurrency(op.unit_cost)}/{op.unit}
                </p>
                {/* Total */}
                <p className="text-sm font-bold text-foreground mt-1">
                  Total: {formatCurrency(op.total_cost)}
                </p>
                {/* Inventory stock badge */}
                {inv && (
                  <div className={cn(
                    'inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border',
                    stockOk
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border-red-500/20'
                  )}>
                    <Package className="h-3 w-3" />
                    Stock: {inv.current_stock?.toLocaleString()} {inv.unit}
                    {stockLow && ' ⚠ Insuficiente'}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setEditingOp({ ...op })}
                >
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => removeOperation(op.id)}
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            </div>
            {/* Quick edit quantity */}
            <button
              type="button"
              className="text-xs text-primary hover:underline mt-2 flex items-center gap-1"
              onClick={() => setEditingOp({ ...op })}
            >
              <Pencil className="h-3 w-3" />
              Editar cantidad
            </button>
          </Card>
          );
        })}

        {/* Add operation button */}
        <Card
          className="p-4 bg-card/30 border-dashed border-border hover:border-primary/40 transition-all cursor-pointer"
          onClick={() => setShowAddDialog(true)}
        >
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Plus className="h-4 w-4" />
            <span className="text-sm">Agregar operación</span>
          </div>
        </Card>
      </div>

      {/* ─── Edit operation dialog ──────────────────────── */}
      <Dialog open={!!editingOp} onOpenChange={(open) => !open && setEditingOp(null)}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Editar Operación</DialogTitle>
          </DialogHeader>
          {editingOp && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Nombre</Label>
                <Input
                  value={editingOp.name}
                  onChange={(e) => setEditingOp({ ...editingOp, name: e.target.value })}
                  className="bg-input border-border mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Cantidad</Label>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={editingOp.quantity}
                    onChange={(e) =>
                      setEditingOp({ ...editingOp, quantity: parseFloat(e.target.value) || 0 })
                    }
                    className="bg-input border-border mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Costo unitario</Label>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={editingOp.unit_cost}
                    onChange={(e) =>
                      setEditingOp({ ...editingOp, unit_cost: parseFloat(e.target.value) || 0 })
                    }
                    className="bg-input border-border mt-1"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Unidad</Label>
                <Input
                  value={editingOp.unit}
                  onChange={(e) => setEditingOp({ ...editingOp, unit: e.target.value })}
                  className="bg-input border-border mt-1"
                />
              </div>
              <p className="text-sm font-bold text-foreground">
                Total: {formatCurrency(editingOp.quantity * editingOp.unit_cost)}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingOp(null)}>
                  Cancelar
                </Button>
                <Button onClick={saveEditedOp} className="bg-primary hover:bg-primary/90">
                  Guardar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Add operation dialog ──────────────────────── */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Agregar Operación</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Categoría</Label>
              <Select
                value={newOp.category}
                onValueChange={(v) => setNewOp({ ...newOp, category: v as OTOperationCategory })}
              >
                <SelectTrigger className="bg-input border-border mt-1">
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
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input
                value={newOp.name || ''}
                onChange={(e) => setNewOp({ ...newOp, name: e.target.value })}
                placeholder="Nombre de la operación"
                className="bg-input border-border mt-1"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Cantidad</Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={newOp.quantity}
                  onChange={(e) => setNewOp({ ...newOp, quantity: parseFloat(e.target.value) || 0 })}
                  className="bg-input border-border mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Costo unit.</Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={newOp.unit_cost}
                  onChange={(e) =>
                    setNewOp({ ...newOp, unit_cost: parseFloat(e.target.value) || 0 })
                  }
                  className="bg-input border-border mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Unidad</Label>
                <Input
                  value={newOp.unit || 'unit'}
                  onChange={(e) => setNewOp({ ...newOp, unit: e.target.value })}
                  className="bg-input border-border mt-1"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancelar
              </Button>
              <Button
                onClick={addOperation}
                disabled={!newOp.name?.trim()}
                className="bg-primary hover:bg-primary/90"
              >
                Agregar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
