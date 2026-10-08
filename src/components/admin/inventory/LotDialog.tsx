'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

export interface LotFormState {
  item_id: string;
  lot_number: string;
  certification_code: string;
  certification_expires_on: string;
  supplier_name: string;
  received_date: string;
  unit_cost: number;
  quantity_received: number;
  quantity_available: number;
}

export function LotDialog({
  open,
  onOpenChange,
  items,
  lotForm,
  setLotForm,
  onCancel,
  onCreate,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: any[];
  lotForm: LotFormState;
  setLotForm: (form: LotFormState) => void;
  onCancel: () => void;
  onCreate: () => void;
  t: (key: string) => string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear lote</DialogTitle>
          <DialogDescription>
            Register batch/lot data for certification traceability and costing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Ítem</Label>
            <Select value={lotForm.item_id} onValueChange={(value) => setLotForm({ ...lotForm, item_id: value })}>
              <SelectTrigger><SelectValue placeholder="Seleccionar artículo" /></SelectTrigger>
              <SelectContent>
                {items.map((item: any) => (
                  <SelectItem key={item.id} value={item.id}>{item.sku} - {item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Número de lote</Label>
              <Input value={lotForm.lot_number} onChange={(e) => setLotForm({ ...lotForm, lot_number: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Input value={lotForm.supplier_name} onChange={(e) => setLotForm({ ...lotForm, supplier_name: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Certification Code</Label>
              <Input value={lotForm.certification_code} onChange={(e) => setLotForm({ ...lotForm, certification_code: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Certification Expiry</Label>
              <Input type="date" value={lotForm.certification_expires_on} onChange={(e) => setLotForm({ ...lotForm, certification_expires_on: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Received Qty</Label>
              <Input type="number" step="0.001" value={lotForm.quantity_received} onChange={(e) => setLotForm({ ...lotForm, quantity_received: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Available Qty</Label>
              <Input type="number" step="0.001" value={lotForm.quantity_available} onChange={(e) => setLotForm({ ...lotForm, quantity_available: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Costo unitario</Label>
              <Input type="number" step="0.0001" value={lotForm.unit_cost} onChange={(e) => setLotForm({ ...lotForm, unit_cost: Number(e.target.value) })} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>{t('cancel')}</Button>
          <Button onClick={onCreate}>Crear lote</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
