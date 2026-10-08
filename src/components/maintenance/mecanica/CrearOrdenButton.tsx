'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { type PartRow, type EmpleadoRow } from './types';

/* ── De pieza rota a trabajo asignado ────────────────────────────────── */

export function CrearOrdenButton({ part }: { part: PartRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [falla, setFalla] = useState('');
  const [asignado, setAsignado] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  const { data: empleados } = useQuery<EmpleadoRow[]>({
    queryKey: ['employees', 'mantenimiento'],
    enabled: open,
    queryFn: async () => {
      const res = await fetch('/api/employees');
      if (!res.ok) throw new Error('No se pudo cargar el personal');
      const json = await res.json();
      const list = Array.isArray(json) ? json : (json.employees ?? []);
      return list.filter((e: { status?: string }) => e.status === 'active');
    },
  });

  const mut = useMutation({
    mutationFn: async (forzar: boolean) => {
      const res = await fetch('/api/maintenance/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machine_id: part.machine_id,
          work_order_type: 'correctivo',
          title: `${part.name}${part.position ? ` (${part.position})` : ''}`,
          fault_description: falla || part.health.reason,
          part_id: part.id,
          assigned_to: asignado || null,
          priority: part.criticality === 'critica' ? 1 : 2,
          acknowledge_unqualified: forzar,
        }),
      });
      const json = await res.json();
      // 409 = quien va a hacerlo no está habilitado en ese sistema.
      if (res.status === 409) {
        setAviso(json.assignee_check?.reason ?? json.error);
        throw new Error('__no_habilitado__');
      }
      if (!res.ok) throw new Error(json.error ?? 'No se pudo crear la orden');
      return json;
    },
    onSuccess: () => {
      // Antes esto era fire-and-forget: la orden quedaba emitida pero nada
      // llevaba a dónde encontrarla de nuevo. "Ver orden" abre directo en la
      // pestaña donde ahora se ejecuta.
      toast.success('Orden de trabajo emitida.', {
        action: { label: 'Ver orden', onClick: () => router.push('/equipos/ordenes?tab=ordenes') },
      });
      setOpen(false);
      setFalla(''); setAsignado(''); setAviso(null);
    },
    onError: (e: Error) => {
      if (e.message !== '__no_habilitado__') toast.error(e.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setAviso(null); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs">
          Crear orden
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Orden de trabajo — {part.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            {part.machine_systems?.name} · {part.health.reason}
          </p>

          <div className="space-y-1.5">
            <Label>¿Qué pasó?</Label>
            <Input
              value={falla}
              onChange={(e) => setFalla(e.target.value)}
              placeholder={part.health.reason}
            />
          </div>

          <div className="space-y-1.5">
            <Label>¿Quién lo hace?</Label>
            <Select value={asignado} onValueChange={(v) => { setAsignado(v); setAviso(null); }}>
              <SelectTrigger><SelectValue placeholder="Sin asignar por ahora" /></SelectTrigger>
              <SelectContent>
                {(empleados ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {aviso && (
            <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">{aviso}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => mut.mutate(true)}
                disabled={mut.isPending}
              >
                Asignar igual, me hago cargo
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate(false)} disabled={mut.isPending}>
            Emitir orden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
