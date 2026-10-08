'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wrench, AlertTriangle, PackageX, ChevronRight, Gauge,
  ShoppingCart, Ship, Truck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { KpiCard } from '@/components/ui/kpi-card';
import { RankedList, type RankedListItem } from '@/components/ui/ranked-list';
import {
  STATUS_LABEL, USAGE_UNIT_LABEL, USAGE_UNIT_SHORT,
} from '@/lib/part-procurement';
import { machineTypeLabel } from '@/types/machine-type';
import {
  STATUS_STYLE, CRITICALITY_STYLE, TONE, URGENCY_COLOR, nf,
  type MachineRow, type SystemRow, type PartRow, type FleetPartRow, type EmpleadoRow,
} from './mecanica/types';
import { PlantillaDialog } from './mecanica/PlantillaDialog';
import { NuevaPiezaDialog } from './mecanica/NuevaPiezaDialog';

/**
 * Qué requiere atención en TODA la flota, no sólo la máquina elegida abajo.
 *
 * /api/machine-parts ya soportaba esto -- `machine_id` es un filtro
 * opcional, y sin él la ruta evalúa y ordena por urgencia (comparePartUrgency)
 * las piezas de todas las máquinas -- pero nada en la UI lo llamaba nunca
 * sin `machine_id`. El resto de este panel sigue mostrando una máquina a la
 * vez porque el flujo de "pedir todo"/plantilla es por máquina; esto es sólo
 * la vista de "qué mirar primero" antes de elegir cuál.
 */
function useFleetParts() {
  return useQuery<{ parts: FleetPartRow[]; summary: Record<string, number | boolean | undefined> }>({
    queryKey: ['machine-parts', 'fleet'],
    queryFn: async () => {
      const res = await fetch('/api/machine-parts');
      if (!res.ok) throw new Error('No se pudieron cargar las piezas de la flota');
      return res.json();
    },
  });
}

function FleetPartsPanel({ onSelectMachine }: { onSelectMachine: (machineId: string) => void }) {
  const { data, isLoading } = useFleetParts();
  const summary = data?.summary ?? {};

  const ranked: RankedListItem[] = useMemo(() => {
    const urgentes = (data?.parts ?? []).filter(
      (p) => !p.on_order && ['vencida', 'atrasado', 'pedir_ahora'].includes(p.health.status)
    );
    // Ya vienen ordenadas por urgencia desde el backend (comparePartUrgency).
    return urgentes.slice(0, 8).map((p) => ({
      id: p.id,
      label: p.name,
      sublabel: p.machines?.name ?? '—',
      barPct: p.health.lifeUsedPct ?? 100,
      barColor: URGENCY_COLOR[p.health.status],
      value: STATUS_LABEL[p.health.status],
      title: p.health.reason,
      onClick: () => onSelectMachine(p.machine_id),
    }));
  }, [data?.parts, onSelectMachine]);

  if (isLoading) return <Skeleton className="h-56 w-full" />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Qué requiere atención en toda la flota</h2>
        <p className="text-xs text-muted-foreground">Piezas vencidas o por pedir, en cualquier máquina.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={PackageX} label="Vencidas" value={String(summary.vencidas ?? 0)} tone={Number(summary.vencidas ?? 0) > 0 ? 'critical' : 'default'} />
        <KpiCard icon={Ship} label="Pedido atrasado" value={String(summary.atrasadas ?? 0)} tone={Number(summary.atrasadas ?? 0) > 0 ? 'warning' : 'default'} />
        <KpiCard icon={ShoppingCart} label="Pedir ahora" value={String(summary.por_pedir ?? 0)} tone={Number(summary.por_pedir ?? 0) > 0 ? 'warning' : 'default'} />
        <KpiCard icon={Truck} label="En camino" value={String(summary.en_camino ?? 0)} tone="info" />
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Piezas más críticas de la flota</CardTitle>
          <p className="text-xs text-muted-foreground">Un clic abre esa máquina abajo.</p>
        </CardHeader>
        <CardContent>
          {ranked.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Ninguna pieza necesita compra ahora mismo en toda la flota.
            </p>
          ) : (
            <RankedList items={ranked} visibleCount={5} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

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

/* ── Contador de la máquina ──────────────────────────────────────────── */

function ContadorCard({
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

/* ── Una pieza ───────────────────────────────────────────────────────── */

function PiezaRow({
  part, unitShort, onReplace, replacing,
}: {
  part: PartRow;
  unitShort: string;
  onReplace: () => void;
  replacing: boolean;
}) {
  const style = STATUS_STYLE[part.health.status];
  const Icon = style.icon;
  const pct = part.health.lifeUsedPct;
  const stockBajo =
    part.current_stock != null &&
    part.suggested_min_stock != null &&
    part.current_stock < part.suggested_min_stock;

  return (
    <li className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{part.name}</span>
            {part.part_number && (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {part.part_number}
              </code>
            )}
            <Badge variant="outline" className={CRITICALITY_STYLE[part.criticality] ?? ''}>
              {part.criticality}
            </Badge>
            {part.is_imported && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Ship className="h-3 w-3" /> Importada
              </Badge>
            )}
          </div>

          {(part.position || part.preferred_supplier) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {part.position && <span>{part.position}</span>}
              {part.position && part.preferred_supplier && <span> · </span>}
              {part.preferred_supplier && <span>{part.preferred_supplier}</span>}
              {part.lead_time_days != null && (
                <span> · reposición {part.lead_time_days} días</span>
              )}
            </p>
          )}

          {/* Barra de vida consumida */}
          {pct != null && (
            <div className="mt-2 max-w-sm">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${style.bar}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {pct}% de vida usada
                {part.health.remainingUsage != null && (
                  <> · quedan {nf.format(part.health.remainingUsage)} {unitShort}</>
                )}
              </p>
            </div>
          )}

          <p className="mt-2 text-xs text-muted-foreground">{part.health.reason}</p>

          {stockBajo && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              Stock {part.current_stock} · el plazo de reposición justifica tener{' '}
              {part.suggested_min_stock}.
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {part.on_order ? (
            /* Ya viene en camino: lo que corresponde es esperar, no comprar
               otra vez. El estado de salud se sigue mostrando en el texto. */
            <Badge variant="outline" className="gap-1 border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300">
              <Truck className="h-3 w-3" />
              En camino
            </Badge>
          ) : (
            <Badge variant="outline" className={`gap-1 ${style.badge}`}>
              <Icon className="h-3 w-3" />
              {STATUS_LABEL[part.health.status]}
            </Badge>
          )}
          <CrearOrdenButton part={part} />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onReplace}
            disabled={replacing}
          >
            Cambié esta pieza
          </Button>
        </div>
      </div>
    </li>
  );
}

/* ── Resumen ─────────────────────────────────────────────────────────── */

function ResumenCard({
  label, value, tone, icon: Icon,
}: {
  label: string; value: number; tone: string; icon: typeof AlertTriangle;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between pt-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={`text-2xl font-bold tabular-nums ${value > 0 ? TONE[tone] : 'text-muted-foreground'}`}>
            {value}
          </p>
        </div>
        <Icon className={`h-5 w-5 ${value > 0 ? TONE[tone] : 'text-muted-foreground/40'}`} />
      </CardContent>
    </Card>
  );
}

/* ── De aviso a orden de compra ──────────────────────────────────────── */

function PedirTodoButton({ partIds, onDone }: { partIds: string[]; onDone: () => void }) {
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

/* ── De pieza rota a trabajo asignado ────────────────────────────────── */

function CrearOrdenButton({ part }: { part: PartRow }) {
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
