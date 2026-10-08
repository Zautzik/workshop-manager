'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wrench, ChevronRight, Gauge, PackageX, ShoppingCart, Ship, Truck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { USAGE_UNIT_LABEL, USAGE_UNIT_SHORT } from '@/lib/part-procurement';
import { machineTypeLabel } from '@/types/machine-type';
import {
  STATUS_STYLE,
  type MachineRow, type SystemRow, type PartRow,
} from './mecanica/types';
import { FleetPartsPanel } from './mecanica/FleetPartsPanel';
import { ContadorCard } from './mecanica/ContadorCard';
import { ResumenCard } from './mecanica/ResumenCard';
import { PedirTodoButton } from './mecanica/PedirTodoButton';
import { PlantillaDialog } from './mecanica/PlantillaDialog';
import { NuevaPiezaDialog } from './mecanica/NuevaPiezaDialog';
import { PiezaRow } from './mecanica/PiezaRow';

export function MecanicaPanel() {
  const qc = useQueryClient();
  const [machineId, setMachineId] = useState<string>('');
  const [openSystems, setOpenSystems] = useState<Set<string>>(new Set());
  const [onlyUrgent, setOnlyUrgent] = useState(false);

  const { data: machines, isLoading: loadingMachines } = useQuery<MachineRow[]>({
    queryKey: ['machines', 'mecanica'],
    queryFn: async () => {
      const res = await fetch('/api/machines');
      if (!res.ok) throw new Error('No se pudieron cargar las máquinas');
      const json = await res.json();
      return Array.isArray(json) ? json : (json.machines ?? []);
    },
  });

  const machine = useMemo(
    () => machines?.find((m) => m.id === machineId) ?? null,
    [machines, machineId]
  );

  const { data: systems } = useQuery<SystemRow[]>({
    queryKey: ['machine-systems', machine?.type],
    enabled: !!machine,
    queryFn: async () => {
      const res = await fetch(`/api/machine-systems?machine_type=${machine!.type}`);
      if (!res.ok) throw new Error('No se pudieron cargar los sistemas');
      return res.json();
    },
  });

  const { data: partsData, isLoading: loadingParts } = useQuery<{
    parts: PartRow[];
    purchasable_ids: string[];
    summary: Record<string, number | boolean | undefined>;
  }>({
    queryKey: ['machine-parts', machineId, onlyUrgent],
    enabled: !!machineId,
    queryFn: async () => {
      const res = await fetch(`/api/machine-parts?machine_id=${machineId}${onlyUrgent ? '&urgent=1' : ''}`);
      if (!res.ok) throw new Error('No se pudieron cargar las piezas');
      return res.json();
    },
  });

  const { data: usage } = useQuery<{
    rate: { uso_por_dia: number | null } | null;
    rate_reason: string | null;
  }>({
    queryKey: ['machine-usage', machineId],
    enabled: !!machineId,
    queryFn: async () => {
      const res = await fetch(`/api/machines/${machineId}/usage`);
      if (!res.ok) throw new Error('No se pudo cargar el contador');
      return res.json();
    },
  });

  const replaceMut = useMutation({
    mutationFn: async (partId: string) => {
      const res = await fetch('/api/machine-parts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: partId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'No se pudo registrar el cambio');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Cambio registrado. La vida útil vuelve a contar desde la lectura actual.');
      qc.invalidateQueries({ queryKey: ['machine-parts'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const parts = useMemo(() => partsData?.parts ?? [], [partsData]);
  const summary = partsData?.summary ?? {};

  const bySystem = useMemo(() => {
    const map = new Map<string, PartRow[]>();
    for (const p of parts) {
      const key = p.system_id;
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return map;
  }, [parts]);

  const unit = machine?.usage_unit ?? 'hours';
  const unitLabel = USAGE_UNIT_LABEL[unit] ?? unit;
  const unitShort = USAGE_UNIT_SHORT[unit] ?? unit;

  const toggleSystem = (id: string) =>
    setOpenSystems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  if (loadingMachines) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <FleetPartsPanel
        onSelectMachine={(id) => {
          setMachineId(id);
          document.getElementById('mecanica-detalle')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />

      {/* ── Selector de máquina + contador ─────────────────────────────── */}
      <Card id="mecanica-detalle" className="scroll-mt-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex-1 space-y-2">
              <Label>Máquina</Label>
              <Select value={machineId} onValueChange={setMachineId}>
                <SelectTrigger className="max-w-md">
                  <SelectValue placeholder="Elige una máquina para ver sus sistemas" />
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

            {machine && (
              <div className="flex items-end gap-4">
                <ContadorCard
                  machine={machine}
                  unitLabel={unitLabel}
                  rate={usage?.rate?.uso_por_dia ?? null}
                  rateReason={usage?.rate_reason ?? null}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!machineId && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Wrench className="mx-auto h-10 w-10 opacity-40" />
            <p className="mt-3 text-sm">
              Elige una máquina arriba. Cada una abre por sistema —hidráulico, entintado,
              aire comprimido— y dentro de cada sistema están sus piezas.
            </p>
          </CardContent>
        </Card>
      )}

      {machineId && (
        <>
          {/* ── Resumen de abastecimiento ────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ResumenCard label="Vencidas"    value={Number(summary.vencidas ?? 0)}   tone="red"    icon={PackageX} />
            <ResumenCard label="Pedido atrasado" value={Number(summary.atrasadas ?? 0)} tone="orange" icon={Ship} />
            <ResumenCard label="Pedir ahora" value={Number(summary.por_pedir ?? 0)}  tone="amber"  icon={ShoppingCart} />
            <ResumenCard label="En camino"   value={Number(summary.en_camino ?? 0)} tone="sky"    icon={Truck} />
          </div>

          {summary.sin_ritmo === true && parts.length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
              <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-amber-800 dark:text-amber-200">
                Esta máquina no tiene lecturas suficientes de su contador, así que la app puede
                decir cuánta vida le queda a cada pieza <strong>en {unitLabel}</strong>, pero no
                en días — y sin días no se puede comparar contra el plazo del proveedor.
                Anota una lectura para empezar a proyectar.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Switch id="urgent" checked={onlyUrgent} onCheckedChange={setOnlyUrgent} />
              <Label htmlFor="urgent" className="cursor-pointer text-sm">
                Sólo lo que hay que comprar
              </Label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PedirTodoButton
                partIds={partsData?.purchasable_ids ?? []}
                onDone={() => qc.invalidateQueries({ queryKey: ['machine-parts'] })}
              />
              <PlantillaDialog
                machineId={machineId}
                onApplied={() => qc.invalidateQueries({ queryKey: ['machine-parts'] })}
              />
              <NuevaPiezaDialog
                machineId={machineId}
                systems={systems ?? []}
                unitLabel={unitLabel}
                onSaved={() => qc.invalidateQueries({ queryKey: ['machine-parts'] })}
              />
            </div>
          </div>

          {/* ── Árbol: sistema → pieza ───────────────────────────────── */}
          {loadingParts ? (
            <Skeleton className="h-64 w-full" />
          ) : parts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                {onlyUrgent
                  ? 'Nada por comprar en esta máquina.'
                  : 'Esta máquina todavía no tiene piezas registradas. Empieza por el sistema que más te haya dado problemas.'}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {(systems ?? [])
                .filter((s) => bySystem.has(s.id))
                .map((system) => {
                  const list = bySystem.get(system.id) ?? [];
                  const abierto = openSystems.has(system.id);
                  const urgentes = list.filter((p) =>
                    ['vencida', 'atrasado', 'pedir_ahora'].includes(p.health.status)
                  ).length;

                  return (
                    <Card key={system.id} className="overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleSystem(system.id)}
                        className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <ChevronRight
                            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${abierto ? 'rotate-90' : ''}`}
                          />
                          <div>
                            <p className="font-semibold">{system.name}</p>
                            {system.description && (
                              <p className="text-xs text-muted-foreground">{system.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {urgentes > 0 && (
                            <Badge variant="outline" className={STATUS_STYLE.pedir_ahora.badge}>
                              {urgentes} por comprar
                            </Badge>
                          )}
                          <Badge variant="secondary">{list.length} piezas</Badge>
                        </div>
                      </button>

                      {abierto && (
                        <CardContent className="border-t bg-muted/20 p-0">
                          <ul className="divide-y">
                            {list.map((p) => (
                              <PiezaRow
                                key={p.id}
                                part={p}
                                unitShort={unitShort}
                                onReplace={() => replaceMut.mutate(p.id)}
                                replacing={replaceMut.isPending}
                              />
                            ))}
                          </ul>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
