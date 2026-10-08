'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { type SystemRow } from './types';

/* ── Alta de pieza ───────────────────────────────────────────────────── */

export function NuevaPiezaDialog({
  machineId, systems, unitLabel, onSaved,
}: {
  machineId: string;
  systems: SystemRow[];
  unitLabel: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    system_id: '', name: '', part_number: '', position: '',
    criticality: 'media', lead_time_days: '', preferred_supplier: '',
    expected_life_usage: '', is_imported: false,
  });

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const mut = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/machine-parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machine_id: machineId,
          system_id: form.system_id,
          name: form.name,
          part_number: form.part_number || null,
          position: form.position || null,
          criticality: form.criticality,
          lead_time_days: form.lead_time_days ? Number(form.lead_time_days) : null,
          preferred_supplier: form.preferred_supplier || null,
          expected_life_usage: form.expected_life_usage ? Number(form.expected_life_usage) : null,
          is_imported: form.is_imported,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar la pieza');
      return json;
    },
    onSuccess: () => {
      toast.success('Pieza registrada.');
      setOpen(false);
      setForm({
        system_id: '', name: '', part_number: '', position: '',
        criticality: 'media', lead_time_days: '', preferred_supplier: '',
        expected_life_usage: '', is_imported: false,
      });
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> Agregar pieza
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva pieza</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Sistema</Label>
            <Select value={form.system_id} onValueChange={(v) => set('system_id', v)}>
              <SelectTrigger><SelectValue placeholder="¿A qué sistema pertenece?" /></SelectTrigger>
              <SelectContent>
                {systems.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nombre</Label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)}
                placeholder="Mantilla cuerpo 1" />
            </div>
            <div className="space-y-1.5">
              <Label>Número de parte</Label>
              <Input value={form.part_number} onChange={(e) => set('part_number', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Posición</Label>
              <Input value={form.position} onChange={(e) => set('position', e.target.value)}
                placeholder="lado operador" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Criticidad</Label>
              <Select value={form.criticality} onValueChange={(v) => set('criticality', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critica">Crítica — para la máquina</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="baja">Baja</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reposición (días)</Label>
              <Input type="number" value={form.lead_time_days}
                onChange={(e) => set('lead_time_days', e.target.value)} placeholder="30" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Proveedor habitual</Label>
            <Input value={form.preferred_supplier}
              onChange={(e) => set('preferred_supplier', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Vida útil esperada ({unitLabel})</Label>
            <Input type="number" value={form.expected_life_usage}
              onChange={(e) => set('expected_life_usage', e.target.value)} />
            <p className="text-xs text-muted-foreground">
              En la unidad de esta máquina. Es lo que permite avisar antes de que falle;
              sin este dato la pieza queda como &quot;sin datos&quot;.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="importada" checked={form.is_imported}
              onCheckedChange={(v) => set('is_imported', v)} />
            <Label htmlFor="importada" className="cursor-pointer text-sm">
              Importada — suma aduana y flete al plazo
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={!form.system_id || form.name.trim().length < 2 || mut.isPending}
          >
            Guardar pieza
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
