'use client';

/**
 * Consumibles de cada máquina: tinta, solvente, alcohol, cola, film.
 *
 * `machine_supply_requirements` existía desde antes y tenía CERO filas — otra
 * tabla construida y nunca alimentada. Vivía además en la ficha de la máquina,
 * lejos de los repuestos, cuando para quien compra son la misma pregunta:
 * "¿qué necesita esta máquina y cuánto dura?".
 *
 * La diferencia con un repuesto es real y por eso son pestañas distintas y no
 * una sola lista: un repuesto se cambia cuando se gasta y tiene vida útil
 * medida en el contador; un consumible se agota a un RITMO por trabajo, y lo
 * que importa es que no falte a mitad de un tiraje.
 */

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Droplets, Plus, Trash2, AlertTriangle, PackageSearch } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { machineTypeLabel } from '@/types/machine-type';

interface MachineRow { id: string; name: string; type: string }
interface SupplyRow {
  id: string;
  inventory_item_id: string;
  consumption_rate: number;
  rate_unit: string;
  is_critical: boolean;
  notes: string | null;
  inventory_items: { id: string; name: string; unit: string; sku: string } | null;
}
interface ItemRow { id: string; name: string; sku: string; unit: string; current_stock: number | null }

/** Cómo se mide el consumo. En el idioma del taller, no del esquema. */
const RATE_UNITS: Record<string, string> = {
  per_1000_sheets: 'por cada 1.000 pliegos',
  per_hour: 'por hora de máquina',
  per_job: 'por trabajo',
  per_shift: 'por turno',
  per_1000_impressions: 'por cada 1.000 impresiones',
};

export function ConsumiblesPanel() {
  const qc = useQueryClient();
  const [machineId, setMachineId] = useState('');

  const { data: machines, isLoading: loadingMachines } = useQuery<MachineRow[]>({
    queryKey: ['machines', 'consumibles'],
    queryFn: async () => {
      const res = await fetch('/api/machines');
      if (!res.ok) throw new Error('No se pudieron cargar las máquinas');
      const json = await res.json();
      return Array.isArray(json) ? json : (json.machines ?? []);
    },
  });

  const { data: supplies, isLoading } = useQuery<SupplyRow[]>({
    queryKey: ['machine-supplies', machineId],
    enabled: !!machineId,
    queryFn: async () => {
      const res = await fetch(`/api/machine-supplies?machine_id=${machineId}`);
      if (!res.ok) throw new Error('No se pudieron cargar los consumibles');
      const json = await res.json();
      return Array.isArray(json) ? json : (json.supplies ?? []);
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/machine-supplies?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'No se pudo quitar');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Consumible quitado.');
      qc.invalidateQueries({ queryKey: ['machine-supplies'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loadingMachines) return <Skeleton className="h-96 w-full" />;

  const lista = supplies ?? [];
  const criticos = lista.filter((s) => s.is_critical).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <Label>Máquina</Label>
            <Select value={machineId} onValueChange={setMachineId}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Elige una máquina" />
              </SelectTrigger>
              <SelectContent>
                {(machines ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {machineTypeLabel(m.type)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!machineId && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Droplets className="mx-auto h-10 w-10 opacity-40" />
            <p className="mx-auto mt-3 max-w-lg text-sm">
              Tinta, solvente, alcohol, cola, film. A diferencia de un repuesto, un
              consumible no se cambia: se gasta a un ritmo. Declararlo permite
              anticipar cuánto hace falta para un tiraje antes de empezarlo.
            </p>
          </CardContent>
        </Card>
      )}

      {machineId && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              {criticos > 0 && (
                <Badge variant="outline" className="border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300">
                  {criticos} crítico{criticos === 1 ? '' : 's'}
                </Badge>
              )}
              <Badge variant="secondary">{lista.length} consumible{lista.length === 1 ? '' : 's'}</Badge>
            </div>
            <NuevoConsumibleDialog
              machineId={machineId}
              yaCargados={lista.map((s) => s.inventory_item_id)}
              onSaved={() => qc.invalidateQueries({ queryKey: ['machine-supplies'] })}
            />
          </div>

          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : lista.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Esta máquina no tiene consumibles declarados. Empieza por los que se
                acaban a mitad de un tiraje.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {lista.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            {s.inventory_items?.name ?? 'Ítem de inventario'}
                          </span>
                          {s.inventory_items?.sku && (
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                              {s.inventory_items.sku}
                            </code>
                          )}
                          {s.is_critical && (
                            <Badge variant="outline" className="gap-1 border-red-500/30 bg-red-500/15 text-xs text-red-700 dark:text-red-300">
                              <AlertTriangle className="h-3 w-3" /> crítico
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                          {s.consumption_rate} {s.inventory_items?.unit ?? ''}{' '}
                          {RATE_UNITS[s.rate_unit] ?? s.rate_unit}
                        </p>
                        {s.notes && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{s.notes}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={() => del.mutate(s.id)} disabled={del.isPending}
                      >
                        <Trash2 className="mr-1 h-3 w-3" /> Quitar
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function NuevoConsumibleDialog({
  machineId, yaCargados, onSaved,
}: {
  machineId: string; yaCargados: string[]; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    inventory_item_id: '', consumption_rate: '', rate_unit: 'per_1000_sheets',
    is_critical: false, notes: '',
  });

  const { data: items } = useQuery<ItemRow[]>({
    queryKey: ['inventory-items', 'consumibles'],
    enabled: open,
    queryFn: async () => {
      const res = await fetch('/api/inventory/items');
      if (!res.ok) throw new Error('No se pudo cargar el inventario');
      const json = await res.json();
      const list = Array.isArray(json) ? json : (json.items ?? json.data ?? []);
      return list.filter((i: { is_active?: boolean }) => i.is_active !== false);
    },
  });

  const disponibles = useMemo(
    () => (items ?? []).filter((i) => !yaCargados.includes(i.id)),
    [items, yaCargados]
  );

  const mut = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/machine-supplies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machine_id: machineId,
          inventory_item_id: form.inventory_item_id,
          consumption_rate: Number(form.consumption_rate),
          rate_unit: form.rate_unit,
          is_critical: form.is_critical,
          notes: form.notes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar');
      return json;
    },
    onSuccess: () => {
      toast.success('Consumible agregado.');
      setOpen(false);
      setForm({ inventory_item_id: '', consumption_rate: '', rate_unit: 'per_1000_sheets', is_critical: false, notes: '' });
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> Agregar consumible
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Consumible de esta máquina</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Ítem de inventario</Label>
            <Select
              value={form.inventory_item_id}
              onValueChange={(v) => setForm((f) => ({ ...f, inventory_item_id: v }))}
            >
              <SelectTrigger><SelectValue placeholder="Elige del inventario" /></SelectTrigger>
              <SelectContent>
                {disponibles.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name} <span className="text-muted-foreground">({i.unit})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {disponibles.length === 0 && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <PackageSearch className="mt-0.5 h-3 w-3 shrink-0" />
                No quedan ítems por asignar. Créalo primero en Inventario.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Cuánto se consume</Label>
              <Input
                type="number" step="0.01" value={form.consumption_rate}
                onChange={(e) => setForm((f) => ({ ...f, consumption_rate: e.target.value }))}
                placeholder="0,4"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Por cada</Label>
              <Select value={form.rate_unit} onValueChange={(v) => setForm((f) => ({ ...f, rate_unit: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RATE_UNITS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nota</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Sube a 0,6 con cobertura alta de tinta"
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="critico" checked={form.is_critical}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_critical: v }))}
            />
            <Label htmlFor="critico" className="cursor-pointer text-sm">
              Crítico — sin esto la máquina no puede correr
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={!form.inventory_item_id || !form.consumption_rate || mut.isPending}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
