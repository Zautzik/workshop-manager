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

export interface TxFormState {
  item_id: string;
  lot_id: string;
  tx_type: string;
  quantity: number;
  unit_cost: number;
  work_order_id: string;
  reference_code: string;
  notes: string;
}

export function TxDialog({
  open,
  onOpenChange,
  items,
  ots,
  filteredLots,
  txOptions,
  txForm,
  setTxForm,
  onCancel,
  onCreate,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: any[];
  ots: any[];
  filteredLots: any[];
  txOptions: { value: string; label: string }[];
  txForm: TxFormState;
  setTxForm: (form: TxFormState) => void;
  onCancel: () => void;
  onCreate: () => void;
  t: (key: string) => string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear movimiento de stock</DialogTitle>
          <DialogDescription>
            Track stock movements and link consumption to work orders.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Ítem</Label>
              <Select
                value={txForm.item_id}
                onValueChange={(value) => setTxForm({ ...txForm, item_id: value, lot_id: '' })}
              >
                <SelectTrigger><SelectValue placeholder="Seleccionar artículo" /></SelectTrigger>
                <SelectContent>
                  {items.map((item: any) => (
                    <SelectItem key={item.id} value={item.id}>{item.sku} - {item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de movimiento</Label>
              <Select value={txForm.tx_type} onValueChange={(value) => setTxForm({ ...txForm, tx_type: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {txOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Lote</Label>
              <Select value={txForm.lot_id} onValueChange={(value) => setTxForm({ ...txForm, lot_id: value })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar lote" /></SelectTrigger>
                <SelectContent>
                  {filteredLots.map((lot: any) => (
                    <SelectItem key={lot.id} value={lot.id}>
                      {lot.lot_number} (avail {Number(lot.quantity_available || 0).toFixed(3)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cantidad</Label>
              <Input type="number" step="0.001" value={txForm.quantity} onChange={(e) => setTxForm({ ...txForm, quantity: Number(e.target.value) })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Costo unitario (opcional)</Label>
              <Input type="number" step="0.0001" value={txForm.unit_cost} onChange={(e) => setTxForm({ ...txForm, unit_cost: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Orden de trabajo (requerida para consumo)</Label>
              <Select value={txForm.work_order_id} onValueChange={(value) => setTxForm({ ...txForm, work_order_id: value })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar OT" /></SelectTrigger>
                <SelectContent>
                  {ots.map((ot: any) => (
                    <SelectItem key={ot.id} value={ot.id}>{ot.ot_number} - {ot.client_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reference code</Label>
            <Input value={txForm.reference_code} onChange={(e) => setTxForm({ ...txForm, reference_code: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea value={txForm.notes} onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>{t('cancel')}</Button>
          <Button onClick={onCreate}>Crear movimiento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
