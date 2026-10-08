'use client';

import { useMutation } from '@tanstack/react-query';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

/* ── De aviso a orden de compra ──────────────────────────────────────── */

export function PedirTodoButton({ partIds, onDone }: { partIds: string[]; onDone: () => void }) {
  const mut = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/machine-parts/purchase-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ part_ids: partIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo generar la compra');
      return json;
    },
    onSuccess: (json) => {
      const ocs = json.created ?? [];
      if (ocs.length === 0) {
        toast.info('Todo lo que hacía falta ya tiene una compra en curso.');
      } else {
        // Se nombra al proveedor: agrupar por proveedor es la decisión que hace
        // esto útil, y conviene que se vea.
        toast.success(
          `${ocs.length} orden(es) en borrador: ${ocs.map((o: { supplier: string; lines: number }) => `${o.supplier} (${o.lines})`).join(' · ')}. Revísalas en Compras antes de enviarlas.`
        );
      }
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (partIds.length === 0) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1"
      onClick={() => mut.mutate()}
      disabled={mut.isPending}
    >
      <ShoppingCart className="h-4 w-4" />
      Pedir las {partIds.length} que faltan
    </Button>
  );
}
