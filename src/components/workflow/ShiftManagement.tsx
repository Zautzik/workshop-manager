'use client';

/**
 * ShiftManagement — qué máquina tiene cada OT asignada, y cambiarlo.
 *
 * Antes "adivinaba" la máquina de cada OT cruzando `machine.type` contra
 * `ot.status` (p.ej. "si la máquina es offset_printer y la OT está en
 * offset_printing, es suya") — una heurística frágil que ignoraba el campo
 * que existe justo para esto, `ots.assigned_machine_id`, y que además
 * comparaba contra estados que no son los de esta app (pending/in_progress/
 * review no existen en el enum ot_status real, así que la adivinanza no
 * acertaba casi nunca). Sin eso, y sin un solo control en pantalla, la
 * pestaña no hacía nada: mostraba una suposición y no dejaba tocar nada.
 *
 * Ahora lee la asignación real y deja cambiarla: cada OT activa tiene un
 * selector de máquina que escribe con PATCH /api/ots/[id] — el mismo
 * endpoint que ya usa el resto de la app para esto —, y las que no tienen
 * máquina asignada aparecen aparte, para asignarlas desde acá en vez de
 * tener que abrir la OT entera.
 */

import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Factory, Package, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOTs } from '@/hooks/use-operations-queries';
import { useMachines, MACHINE_TYPE_LABELS, MACHINE_STATUS_LABELS, MACHINE_STATUS_COLOR } from '@/hooks/use-machines';
import { useAuth } from '@/contexts/AuthContext';
import { otStatusLabel, otStatusBadgeClass } from '@/lib/status-labels';
import { cn } from '@/lib/utils';

const SIN_ASIGNAR = '__sin_asignar__';

function OTCard({ ot, canEdit, machines, onReassign }: {
  ot: any;
  canEdit: boolean;
  machines: { id: string; name: string }[];
  onReassign: (otId: string, machineId: string | null) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-semibold text-foreground">{ot.ot_number}</p>
          <p className="truncate text-xs text-muted-foreground">{ot.client_name}</p>
        </div>
        <Badge variant="outline" className={cn('shrink-0 text-[10px]', otStatusBadgeClass(ot.status))}>
          {otStatusLabel(ot.status)}
        </Badge>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {ot.product_name || ot.description || '—'} · {(ot.quantity ?? 0).toLocaleString('es-CL')} u
      </p>
      {canEdit && (
        <Select
          value={ot.assigned_machine_id ?? SIN_ASIGNAR}
          onValueChange={(v) => onReassign(ot.id, v === SIN_ASIGNAR ? null : v)}
        >
          <SelectTrigger className="mt-2 h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_ASIGNAR}>Sin asignar</SelectItem>
            {machines.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export function ShiftManagement() {
  const { data: machines = [], isLoading: machinesLoading } = useMachines(true);
  const { data: otsRaw = [], isLoading: otsLoading } = useOTs();
  const { role } = useAuth();
  const queryClient = useQueryClient();
  // Mismo criterio que PlanSemanal y el cronograma: sólo admin/supervisor
  // reasignan — coincide con el rol que exige PATCH /api/ots/[id].
  const canEdit = role === 'admin' || role === 'supervisor';

  const activeOts = useMemo(
    () => (otsRaw as any[]).filter((ot) => ot.status !== 'completed'),
    [otsRaw],
  );

  const byMachine = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const ot of activeOts) {
      if (!ot.assigned_machine_id) continue;
      const list = map.get(ot.assigned_machine_id) ?? [];
      list.push(ot);
      map.set(ot.assigned_machine_id, list);
    }
    return map;
  }, [activeOts]);

  const sinAsignar = useMemo(
    () => activeOts.filter((ot) => !ot.assigned_machine_id),
    [activeOts],
  );

  const reassign = async (otId: string, machineId: string | null) => {
    const res = await fetch(`/api/ots/${otId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ assigned_machine_id: machineId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? 'No se pudo reasignar la OT');
      return;
    }
    toast.success(machineId ? 'OT reasignada' : 'OT sin asignar');
    queryClient.invalidateQueries({ queryKey: ['ots'] });
  };

  if (machinesLoading || otsLoading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">Cargando máquinas…</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {!canEdit && (
        <p className="text-xs text-muted-foreground">
          Vista de solo lectura: solo admin y supervisor pueden reasignar una OT a otra máquina desde acá.
        </p>
      )}

      {sinAsignar.length > 0 && (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Sin máquina asignada ({sinAsignar.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sinAsignar.map((ot) => (
                <OTCard key={ot.id} ot={ot} canEdit={canEdit} machines={machines} onReassign={reassign} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {machines.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No hay máquinas activas registradas.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {machines.map((machine) => {
            const asignadas = byMachine.get(machine.id) ?? [];
            return (
              <Card key={machine.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Factory className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{machine.name}</span>
                    </span>
                    <Badge className={cn('shrink-0 text-[10px] text-white', MACHINE_STATUS_COLOR[machine.status] ?? 'bg-gray-400')}>
                      {MACHINE_STATUS_LABELS[machine.status] ?? machine.status}
                    </Badge>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{MACHINE_TYPE_LABELS[machine.type] ?? machine.type}</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {asignadas.length === 0 ? (
                    <p className="flex items-center gap-1.5 py-2 text-xs text-muted-foreground">
                      <Package className="h-3.5 w-3.5" /> Sin OT activa asignada
                    </p>
                  ) : (
                    asignadas.map((ot) => (
                      <OTCard key={ot.id} ot={ot} canEdit={canEdit} machines={machines} onReassign={reassign} />
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
