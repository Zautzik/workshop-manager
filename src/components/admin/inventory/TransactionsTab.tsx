'use client';

import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus } from 'lucide-react';
import { formatCLP } from '@/lib/format';

export function TransactionsTab({
  transactions,
  txTypeLabel,
  onAddTransaction,
}: {
  transactions: any[];
  txTypeLabel: Record<string, string>;
  onAddTransaction: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onAddTransaction} className="bg-primary hover:bg-primary/90">
          <Plus className="mr-2 h-4 w-4" />
          Agregar movimiento
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Ítem</TableHead>
            <TableHead>Lote</TableHead>
            <TableHead className="text-right">Cantidad</TableHead>
            <TableHead>Orden de trabajo</TableHead>
            <TableHead className="text-right">Costo estimado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((tx: any) => (
            <TableRow key={tx.id}>
              <TableCell>{new Date(tx.created_at).toLocaleString('es-CL')}</TableCell>
              <TableCell>{txTypeLabel[tx.tx_type] ?? tx.tx_type}</TableCell>
              <TableCell>{tx.item_name}</TableCell>
              <TableCell>{tx.lot_number || '-'}</TableCell>
              <TableCell className="text-right tabular-nums">{Number(tx.quantity).toFixed(3)} {tx.unit}</TableCell>
              <TableCell>{tx.ot_number ? `${tx.ot_number} (${tx.client_name || 'Sin cliente'})` : '-'}</TableCell>
              <TableCell className="text-right tabular-nums">{formatCLP(Number(tx.estimated_total_cost || 0))}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
