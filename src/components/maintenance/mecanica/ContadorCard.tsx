'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { nf, type MachineRow } from './types';

/* ── Contador de la máquina ──────────────────────────────────────────── */

export function ContadorCard({
  machine, unitLabel, rate, rateReason,
}: {
  machine: MachineRow;
  unitLabel: string;
  rate: number | null;
  rateReason: string | null;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [valor, setValor] = useState('');

  const mut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/machines/${machine.id}/usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reading: Number(valor) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo registrar la lectura');
      return json;
    },
    onSuccess: (json) => {
      if (json.warning) toast.warning(json.warning);
      else toast.success('Lectura registrada.');
      setOpen(false);
      setValor('');
      qc.invalidateQueries({ queryKey: ['machine-usage'] });
      qc.invalidateQueries({ queryKey: ['machine-parts'] });
      qc.invalidateQueries({ queryKey: ['machines'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Contador</p>
      <p className="font-mono text-2xl font-semibold tabular-nums">
        {nf.format(machine.usage_counter ?? 0)}
        <span className="ml-1 text-xs font-normal text-muted-foreground">{unitLabel}</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {rate != null
          ? `≈ ${nf.format(rate)} ${unitLabel}/día`
          : (rateReason ?? 'Sin ritmo calculado')}
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="mt-2 h-7 w-full text-xs">
            <Gauge className="mr-1 h-3 w-3" /> Anotar lectura
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lectura del contador — {machine.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="lectura">Valor actual ({unitLabel})</Label>
              <Input
                id="lectura"
                type="number"
                inputMode="numeric"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder={nf.format(machine.usage_counter ?? 0)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Cada lectura queda registrada con su fecha. Con dos o más, la app calcula el
              ritmo de uso y recién ahí puede decir en qué fecha se agota cada pieza.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => mut.mutate()} disabled={!valor || mut.isPending}>
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
