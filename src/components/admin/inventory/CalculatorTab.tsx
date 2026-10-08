'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Calculator } from 'lucide-react';
import { formatCLP } from '@/lib/format';

export function CalculatorTab({ items }: { items: any[] }) {
  const [calculator, setCalculator] = useState({
    item_id: '',
    quantity: 0,
  });

  const estimatedSelection = useMemo(() => {
    const selected = items.find((item: any) => item.id === calculator.item_id);
    if (!selected) return null;
    const unitCost = Number(selected.weighted_unit_cost || selected.estimated_unit_cost || 0);
    const quantity = Number(calculator.quantity || 0);
    return {
      name: selected.name,
      unit: selected.unit,
      unitCost,
      quantity,
      total: unitCost * quantity,
      stock: Number(selected.current_stock || 0),
    };
  }, [calculator, items]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="h-4 w-4" />
          Calculadora de costo estimado
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Artículo de inventario</Label>
            <Select
              value={calculator.item_id}
              onValueChange={(value) => setCalculator((prev) => ({ ...prev, item_id: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar artículo" />
              </SelectTrigger>
              <SelectContent>
                {items.map((item: any) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.sku} - {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Cantidad</Label>
            <Input
              type="number"
              min="0"
              step="0.001"
              value={calculator.quantity}
              onChange={(e) => setCalculator((prev) => ({ ...prev, quantity: Number(e.target.value) }))}
            />
          </div>
        </div>

        {estimatedSelection && (
          <div className="rounded-md border p-3 bg-muted/30 text-sm">
            <p><strong>Item:</strong> {estimatedSelection.name}</p>
            <p><strong>Available stock:</strong> {estimatedSelection.stock.toFixed(3)} {estimatedSelection.unit}</p>
            <p><strong>Estimated unit cost:</strong> {formatCLP(estimatedSelection.unitCost)}</p>
            <p className="text-base font-semibold mt-2">
              Estimated total: {formatCLP(estimatedSelection.total)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
