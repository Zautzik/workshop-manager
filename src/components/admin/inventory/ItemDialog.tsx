'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CATEGORY_OPTIONS, MATERIAL_KIND_OPTIONS } from './constants';

export interface ItemFormState {
  sku: string;
  barcode_value: string;
  qr_value: string;
  name: string;
  category: string;
  material_kind: string;
  unit: string;
  min_stock: number;
  estimated_unit_cost: number;
  is_certification_required: boolean;
  is_active: boolean;
  notes: string;
}

export function ItemDialog({
  open,
  onOpenChange,
  editingItem,
  itemForm,
  setItemForm,
  onCancel,
  onSave,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem: any;
  itemForm: ItemFormState;
  setItemForm: (form: ItemFormState) => void;
  onCancel: () => void;
  onSave: () => void;
  t: (key: string) => string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingItem ? 'Editar ítem de inventario' : 'Crear ítem de inventario'}</DialogTitle>
          <DialogDescription>
            Herramientas, insumos, materias primas y repuestos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Código</Label>
              <Input value={itemForm.sku} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Barcode</Label>
              <Input value={itemForm.barcode_value} onChange={(e) => setItemForm({ ...itemForm, barcode_value: e.target.value })} placeholder="Valor del código de barras" />
            </div>
            <div className="space-y-2">
              <Label>QR Code</Label>
              <Input value={itemForm.qr_value} onChange={(e) => setItemForm({ ...itemForm, qr_value: e.target.value })} placeholder="Valor del QR" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select value={itemForm.category} onValueChange={(value) => setItemForm({ ...itemForm, category: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((category) => (
                    <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              {/* Distinto de Categoría: ahí es durable-vs-consumible, acá es
                  papel-vs-tinta-vs-envase — la pregunta que decide, por
                  ejemplo, si un lote de este ítem puede salir de bodega en
                  la etapa que sólo saca papel (auditoría 2026-08). */}
              <Label>Familia de material</Label>
              <Select
                value={itemForm.material_kind || '__sin_clasificar__'}
                onValueChange={(value) =>
                  setItemForm({ ...itemForm, material_kind: value === '__sin_clasificar__' ? '' : value })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__sin_clasificar__">Sin clasificar</SelectItem>
                  {MATERIAL_KIND_OPTIONS.map((kind) => (
                    <SelectItem key={kind.value} value={kind.value}>{kind.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Unidad</Label>
              <Input value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Stock mínimo</Label>
              <Input type="number" step="0.001" value={itemForm.min_stock} onChange={(e) => setItemForm({ ...itemForm, min_stock: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Costo unitario estimado</Label>
              <Input type="number" step="0.0001" value={itemForm.estimated_unit_cost} onChange={(e) => setItemForm({ ...itemForm, estimated_unit_cost: Number(e.target.value) })} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea value={itemForm.notes} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>{t('cancel')}</Button>
          <Button onClick={onSave}>{editingItem ? t('update') : t('create')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
