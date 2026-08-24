'use client';
import { useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDaySchedule, useUnscheduledOTs } from '@/hooks/use-workflow-queries';
import { useMachines } from '@/hooks/use-machines';
import {
  groupMachinesForAssignment,
  suggestedSlot,
  type MachineLike,
  type OtHoursLike,
} from '@/lib/machine-assignment';
import { useRealtimeProduction } from '@/hooks/use-realtime-production';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { AdvanceFlags } from '@/components/workflow/AdvanceFlags';
import { dateToLocalIso } from '@/lib/week-dates';
import {
  ChevronLeft, ChevronRight, Printer, RefreshCw, Plus,
  Clock, AlertTriangle, CheckCircle2, Wifi, WifiOff, Trash2,
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const COLOR_VALUE: Record<string, string> = {
  cmyk: '4', '1_color': '1', '2_color': '2', '3_color': '3',
  cmyk_pantone: '4+P', sin_impresion: '0',
};
function formatColor(front?: string | null, back?: string | null) {
  if (!front) return '—';
  return `${COLOR_VALUE[front] ?? '?'}/${COLOR_VALUE[back ?? ''] ?? '0'}`;
}

function fmtTime(dt?: string | null) {
  if (!dt) return '—';
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(dt?: string | null) {
  if (!dt) return '—';
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function isOverdue(dl?: string | null) {
  return !!dl && new Date(dl) < new Date();
}
// Antes decía `d.toISOString().split('T')[0]` — toISOString() convierte a
// UTC primero, así que en Santiago (UTC-3/-4) el botón "Hoy" tecleado
// entre ~21:00 y medianoche local seleccionaba el día SIGUIENTE. Bug real
// y en vivo, encontrado al consolidar esta misma lógica duplicada en
// PlantaBoard y PlanSemanal — ver src/lib/week-dates.ts (auditoría 2026-08).
const getDateIso = dateToLocalIso;

const MACHINE_TYPE_LABEL: Record<string, string> = {
  offset_printer: 'Offset',
  digital_printer: 'Digital',
  die_cutter: 'Troqueladora',
  guillotine: 'Guillotina',
  manual_workshop: 'Taller Manual',
  pre_press: 'Pre-Prensa',
  delivery: 'Despacho',
};

const STATUS_LABELS: Record<string, string> = {
  pre_press: 'Pre-Prensa', visto_bueno: 'Visto Bueno', paper_purchase: 'Compras',
  in_storage: 'Bodega', guillotine_first_cut: '1er Corte', offset_printing: 'Impresión',
  die_cutting: 'Troquelado', guillotine_final_cut: 'Corte Final', workshop: 'Taller',
  outsourced: 'Tercerizado', workshop_revision: 'Revisión', ready_for_delivery: 'Listo',
  in_delivery: 'En Entrega', completed: 'Completado',
};

// Confidence badge colors
const CONF_COLORS: Record<string, string> = {
  high:   'bg-green-500/20 text-green-700 border-green-500/30',
  medium: 'bg-amber-500/20 text-amber-700 border-amber-500/30',
  low:    'bg-slate-400/20 text-slate-600 border-slate-400/30',
};

// ─── Shift load bar ──────────────────────────────────────────────────────────

function ShiftLoadBar({ totalHours, shiftHours = 9 }: { totalHours: number; shiftHours?: number }) {
  const pct = Math.min((totalHours / shiftHours) * 100, 100);
  const over = totalHours > shiftHours;
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${over ? 'bg-destructive' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-mono font-semibold tabular-nums ${over ? 'text-destructive' : 'text-foreground'}`}>
        {totalHours.toFixed(1)}/{shiftHours}h
      </span>
      {over && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
    </div>
  );
}

/**
 * "2026-08-02" + "08:00" → el instante UTC de las 08:00 EN EL TALLER.
 * Sin la `Z`, `new Date` interpreta la cadena como hora local, que es
 * exactamente lo que el operador escribió en el reloj de la pared.
 */
function localWallClockToIso(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm}:00`).toISOString();
}

// ─── Add-to-schedule dialog (inline) ────────────────────────────────────────

function AddSlotRow({
  otId, machineId, machineName, date, ot, onDone,
}: {
  otId: string;
  machineId: string;
  machineName?: string;
  date: string;
  ot?: OtHoursLike | null;
  onDone: () => void;
}) {
  // El horario propuesto sale de las horas que la propia OT ya calculó. Antes
  // se ofrecía 08:00–17:00 fijo, así que una OT de dos horas bloqueaba la
  // máquina el día entero en la hoja.
  const suggested = useMemo(() => suggestedSlot(ot), [ot]);
  const [startTime, setStartTime] = useState(suggested.start);
  const [endTime, setEndTime] = useState(suggested.end);
  const [hoursOverride, setHoursOverride] = useState('');
  const [paperType, setPaperType] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const save = async () => {
    setSaving(true);
    const res = await fetch('/api/ot-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ot_id: otId,
        machine_id: machineId,
        // El operador escribe la hora del taller. Pegarle una "Z" la declaraba
        // UTC, así que un turno de 08:00 se guardaba como 08:00 UTC y la hoja lo
        // devolvía a las 04:00 de la mañana. Construir la fecha sin sufijo la
        // interpreta como hora local, y toISOString() la convierte al instante
        // correcto.
        scheduled_start: localWallClockToIso(date, startTime),
        scheduled_end:   localWallClockToIso(date, endTime),
        hours_override:  hoursOverride ? parseFloat(hoursOverride) : null,
        paper_type_label: paperType || null,
      }),
    });

    if (!res.ok) {
      setSaving(false);
      toast({ title: 'Error al agregar', variant: 'destructive' });
      return;
    }

    // ── Hilo dorado ──────────────────────────────────────────────────────────
    // La máquina de una OT vive en DOS tablas: `ot_machine_schedule` (la agenda
    // del día, que es lo que se acaba de escribir) y `ots.assigned_machine_id`
    // (lo que leen Órdenes en Proceso, Planta y el costeo). Escribir sólo una
    // dejaba las dos versiones en desacuerdo: la hoja decía "sin programar"
    // mientras Órdenes en Proceso ya mostraba una máquina. Se escriben las dos
    // en el mismo gesto.
    const link = await fetch(`/api/ots/${otId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_machine_id: machineId }),
    });
    setSaving(false);

    if (!link.ok) {
      // El turno sí quedó; lo que falló es la propagación. Decirlo, en vez de
      // dejar al usuario creyendo que todo cuadró.
      toast({
        title: 'Turno agregado, pero la OT no quedó enlazada',
        description: 'La hoja de hoy la muestra, pero Órdenes en Proceso puede seguir mostrando otra máquina.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'OT asignada',
        description: `${machineName ?? 'Máquina'} · ${startTime}–${endTime}`,
      });
    }

    onDone();
  };

  return (
    <tr className="bg-primary/5 border-b border-primary/20">
      <td colSpan={12} className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-foreground">Inicio:</span>
          <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-7 w-28 text-xs" />
          <span className="font-medium text-foreground">Fin:</span>
          <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-7 w-28 text-xs" />
          <span className="font-medium text-foreground">HRS:</span>
          <Input
            type="number" step="0.5" placeholder="Auto"
            value={hoursOverride} onChange={e => setHoursOverride(e.target.value)}
            className="h-7 w-20 text-xs"
          />
          <span className="font-medium text-foreground">Papel:</span>
          <Input
            placeholder="Tipo papel…" value={paperType}
            onChange={e => setPaperType(e.target.value)}
            className="h-7 w-40 text-xs"
          />
          <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : 'Agregar'}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onDone}>
            Cancelar
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function HojaProduccion() {
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(getDateIso(today));
  const { data: slots = [], isLoading, refetch } = useDaySchedule(selectedDate);
  const { data: unscheduled = [] } = useUnscheduledOTs(selectedDate);
  const { data: allMachines = [] } = useMachines();
  const { isConnected } = useRealtimeProduction();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [addingSlot, setAddingSlot] = useState<{ otId: string; machineId: string } | null>(null);

  const machineNameById = useMemo(
    () => new Map((allMachines ?? []).map((m: MachineLike) => [m.id, m.name])),
    [allMachines],
  );

  // ── Hilo dorado ────────────────────────────────────────────────────────────
  // Asignar una máquina toca la agenda del día Y la OT. Invalidar sólo
  // 'schedule' dejaba a Órdenes en Proceso y a Planta mostrando la máquina
  // anterior hasta que alguien recargaba a mano.
  // `['schedule']` cubre por prefijo tanto la agenda del día como la lista de
  // OTs sin programar (`['schedule','unscheduled',date]`), y `['ots']` cubre
  // `['ots','active']`, que es de donde lee Órdenes en Proceso.
  const refreshGoldenThread = useCallback(() => {
    for (const key of [['schedule'], ['ots'], ['machines']]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  }, [queryClient]);

  // ── patch flag helper ──────────────────────────────────────────────────────
  const patchFlag = useCallback(async (otId: string, flag: string, value: boolean) => {
    const res = await fetch(`/api/ots/${otId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [flag]: value }),
    });
    if (!res.ok) toast({ title: 'Error al guardar', variant: 'destructive' });
    else queryClient.invalidateQueries({ queryKey: ['schedule'] });
  }, [queryClient, toast]);

  // ── patch slot helper ──────────────────────────────────────────────────────
  const patchSlot = useCallback(async (slotId: string, fields: Record<string, unknown>) => {
    const res = await fetch(`/api/ot-schedule/${slotId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    if (!res.ok) toast({ title: 'Error al actualizar', variant: 'destructive' });
    else queryClient.invalidateQueries({ queryKey: ['schedule'] });
  }, [queryClient, toast]);

  // ── delete slot ────────────────────────────────────────────────────────────
  const deleteSlot = useCallback(async (slotId: string) => {
    const res = await fetch(`/api/ot-schedule/${slotId}`, { method: 'DELETE' });
    if (!res.ok) toast({ title: 'Error al eliminar', variant: 'destructive' });
    else queryClient.invalidateQueries({ queryKey: ['schedule'] });
  }, [queryClient, toast]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const moveDate = (delta: number) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    setSelectedDate(getDateIso(d));
  };

  // ── Group slots by machine ─────────────────────────────────────────────────
  const byMachine: Record<string, { machine: any; slots: typeof slots }> = {};
  for (const slot of slots) {
    const mid = (slot as any).machine?.id ?? 'unknown';
    if (!byMachine[mid]) byMachine[mid] = { machine: (slot as any).machine, slots: [] };
    byMachine[mid].slots.push(slot);
  }
  const machineGroups = Object.values(byMachine);

  // ── Máquinas asignables ───────────────────────────────────────────────────
  // Vienen de la flota, no de los turnos ya programados. Derivarlas de los
  // turnos creaba un punto muerto: con la agenda del día vacía no había ninguna
  // máquina que ofrecer, así que la primera OT del día no se podía programar
  // nunca. Agrupadas por función para no leer 17 nombres sueltos.
  const assignableGroups = useMemo(
    () => groupMachinesForAssignment((allMachines ?? []) as MachineLike[]),
    [allMachines],
  );

  const printDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-CL', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  });

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <Card className="bg-card/80 border-border backdrop-blur-sm p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8 border-border bg-card/50" onClick={() => moveDate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="h-8 w-36 text-sm"
            />
            <Button variant="outline" size="icon" className="h-8 w-8 border-border bg-card/50" onClick={() => moveDate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline" size="sm"
              className="h-8 border-border bg-card/50 text-xs"
              onClick={() => setSelectedDate(getDateIso(today))}
            >
              Hoy
            </Button>
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            {isConnected
              ? <><Wifi className="h-3.5 w-3.5 text-green-500" /><span className="text-xs text-green-600">En vivo</span></>
              : <><WifiOff className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs text-muted-foreground">Desconectado</span></>
            }
          </div>

          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8 border-border bg-card/50 gap-1.5">
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="h-8 border-border bg-card/50 gap-1.5 print:hidden">
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
        </div>
      </Card>

      {/* ── Print header ── */}
      <div className="hidden print:block text-center mb-2">
        <h1 className="text-xl font-bold uppercase tracking-wide">Hoja de Producción</h1>
        <p className="text-sm text-gray-600 capitalize">{printDate}</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Cargando programación…</div>
      ) : machineGroups.length === 0 ? (
        <Card className="bg-card/80 border-border p-8 text-center text-muted-foreground text-sm">
          No hay OTs programadas para este día.
          {unscheduled.length > 0 && (
            <p className="mt-2 text-xs">Hay {unscheduled.length} OT(s) activa(s) sin programar — asígnalas abajo.</p>
          )}
        </Card>
      ) : (
        machineGroups.map(({ machine, slots: mSlots }) => {
          const totalHrs = mSlots.reduce((acc: number, s: any) => {
            return acc + (Number((s as any).hours_override ?? (s as any).estimated_hours ?? 0));
          }, 0);
          return (
            <Card key={machine?.id ?? 'unknown'} className="bg-card/80 border-border backdrop-blur-sm overflow-hidden">
              {/* Machine header */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
                <div>
                  <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">
                    {machine?.name ?? 'Sin máquina'}{' '}
                    <span className="text-muted-foreground font-normal normal-case text-xs">
                      ({MACHINE_TYPE_LABEL[machine?.type] ?? machine?.type})
                    </span>
                  </h3>
                  <ShiftLoadBar totalHours={totalHrs} />
                </div>
                <Badge variant="outline" className={
                  machine?.status === 'running' ? 'bg-green-500/20 text-green-700 border-green-500/30' :
                  machine?.status === 'maintenance' ? 'bg-destructive/20 text-destructive border-destructive/30' :
                  'bg-muted/20 text-muted-foreground border-muted'
                }>
                  {machine?.status ?? '—'}
                </Badge>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/20 text-muted-foreground uppercase tracking-wide text-[10px]">
                      <th className="px-2 py-2 text-left w-[170px]">Avance</th>
                      <th className="px-2 py-2 text-left w-[70px]">O.T.</th>
                      <th className="px-2 py-2 text-left">Cliente</th>
                      <th className="px-2 py-2 text-left">Trabajo</th>
                      <th className="px-2 py-2 text-right w-[60px]">Cant.</th>
                      <th className="px-2 py-2 text-center w-[50px]">Color</th>
                      <th className="px-2 py-2 text-left">Procesos / Avance</th>
                      <th className="px-2 py-2 text-left">Tipo Papel</th>
                      <th className="px-2 py-2 text-center w-[70px]">Medio A</th>
                      <th className="px-2 py-2 text-right w-[50px]">Pliego</th>
                      <th className="px-2 py-2 text-center w-[55px]">Entrega</th>
                      <th className="px-2 py-2 text-center w-[40px]">HRS</th>
                      <th className="px-2 py-2 text-center w-[55px]">Inicio</th>
                      <th className="px-2 py-2 text-center w-[55px]">Término</th>
                      <th className="px-2 py-2 text-center w-[32px] print:hidden"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {mSlots.map((slot: any, idx: number) => {
                      const ot = slot.ot;
                      if (!ot) return null;
                      const hrs = slot.hours_override ?? slot.estimated_hours;
                      const hasOverride = slot.hours_override != null;
                      const overdue = isOverdue(ot.deadline);
                      return (
                        <tr
                          key={slot.id}
                          className={`border-b border-border/50 hover:bg-muted/10 transition-colors ${
                            !ot.flag_paper_arrived ? 'opacity-70 bg-amber-500/5' : ''
                          } ${idx % 2 === 0 ? '' : 'bg-muted/5'}`}
                        >
                          {/* Avance — one control for the whole ORD→PAP chain */}
                          <td className="px-2 py-1.5">
                            <AdvanceFlags
                              ot={ot}
                              onAdvance={(key) => patchFlag(ot.id, key, true)}
                              onUndo={(key) => patchFlag(ot.id, key, false)}
                            />
                          </td>

                          {/* OT # */}
                          <td className="px-2 py-1.5 font-mono font-semibold text-foreground whitespace-nowrap">
                            {ot.ot_number}
                          </td>

                          {/* Cliente */}
                          <td className="px-2 py-1.5 font-medium text-foreground">{ot.client_name}</td>

                          {/* Trabajo */}
                          <td className="px-2 py-1.5 text-foreground max-w-[160px]">
                            <span className="line-clamp-2">{ot.product_name || ot.description || '—'}</span>
                          </td>

                          {/* Cant */}
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {ot.quantity?.toLocaleString('es-CL') ?? '—'}
                          </td>

                          {/* Color */}
                          <td className="px-2 py-1.5 text-center font-mono">
                            {formatColor(ot.color_front, ot.color_back)}
                          </td>

                          {/* Procesos / Avance */}
                          <td className="px-2 py-1.5">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-muted-foreground font-medium">
                                {STATUS_LABELS[ot.status] ?? ot.status}
                              </span>
                              {ot.proceso_actual && (
                                <span className="text-foreground text-[10px]">{ot.proceso_actual}</span>
                              )}
                            </div>
                          </td>

                          {/* Tipo papel */}
                          <td className="px-2 py-1.5 text-foreground">
                            {slot.paper_type_label || '—'}
                          </td>

                          {/* Medio A (sheet dims) */}
                          <td className="px-2 py-1.5 text-center font-mono text-muted-foreground">
                            {slot.sheet_width_cm && slot.sheet_height_cm
                              ? `${slot.sheet_width_cm}×${slot.sheet_height_cm}`
                              : '—'}
                          </td>

                          {/* Pliego */}
                          <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                            {slot.calc_sheets?.toLocaleString('es-CL') ?? '—'}
                          </td>

                          {/* Entrega */}
                          <td className={`px-2 py-1.5 text-center tabular-nums font-medium ${overdue ? 'text-destructive' : 'text-foreground'}`}>
                            {fmtDate(ot.deadline)}
                          </td>

                          {/* HRS */}
                          <td className="px-2 py-1.5 text-center">
                            {hrs != null ? (
                              <span className={`font-mono font-semibold ${hasOverride ? 'text-primary' : 'text-muted-foreground'}`}>
                                {Number(hrs).toFixed(1)}
                                {hasOverride && <span className="text-[9px] ml-0.5">★</span>}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>

                          {/* Inicio */}
                          <td className="px-2 py-1.5 text-center font-mono text-foreground">
                            {fmtTime(slot.scheduled_start)}
                          </td>

                          {/* Término */}
                          <td className="px-2 py-1.5 text-center font-mono text-foreground">
                            {fmtTime(slot.scheduled_end)}
                          </td>

                          {/* Delete */}
                          <td className="px-2 py-1.5 text-center print:hidden">
                            <button
                              onClick={() => deleteSlot(slot.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title="Quitar de este día"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Add slot row inline */}
                    {addingSlot && addingSlot.machineId === machine?.id && (
                      <AddSlotRow
                        otId={addingSlot!.otId}
                        machineId={machine.id}
                        machineName={machine?.name}
                        date={selectedDate}
                        onDone={() => {
                          setAddingSlot(null);
                          refreshGoldenThread();
                        }}
                      />
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })
      )}

      {/* ── Backlog panel — unscheduled active OTs ── */}
      {unscheduled.length > 0 && (
        <Card className="bg-card/80 border-border backdrop-blur-sm p-4">
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            OTs Activas sin Programar ({unscheduled.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-muted-foreground uppercase tracking-wide text-[10px]">
                  <th className="px-2 py-1.5 text-left">O.T.</th>
                  <th className="px-2 py-1.5 text-left">Cliente</th>
                  <th className="px-2 py-1.5 text-left">Trabajo</th>
                  <th className="px-2 py-1.5 text-right">Cant.</th>
                  <th className="px-2 py-1.5 text-center">Estado</th>
                  <th className="px-2 py-1.5 text-center">Entrega</th>
                  <th className="px-2 py-1.5 text-center print:hidden">Agregar</th>
                </tr>
              </thead>
              <tbody>
                {unscheduled.map((ot: any, idx) => (
                  <tr key={ot.id} className={`border-b border-border/40 hover:bg-muted/10 ${idx % 2 === 0 ? '' : 'bg-muted/5'}`}>
                    <td className="px-2 py-1.5 font-mono font-semibold">{ot.ot_number}</td>
                    <td className="px-2 py-1.5">{ot.client_name}</td>
                    <td className="px-2 py-1.5 max-w-[160px]">
                      <span className="line-clamp-1">{ot.product_name || ot.description || '—'}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{ot.quantity?.toLocaleString('es-CL') ?? '—'}</td>
                    <td className="px-2 py-1.5 text-center text-muted-foreground">{STATUS_LABELS[ot.status] ?? ot.status}</td>
                    <td className={`px-2 py-1.5 text-center tabular-nums ${isOverdue(ot.deadline) ? 'text-destructive font-semibold' : 'text-foreground'}`}>
                      {fmtDate(ot.deadline)}
                    </td>
                    <td className="px-2 py-1.5 text-center print:hidden">
                      {assignableGroups.length > 0 ? (
                        <select
                          value=""
                          aria-label={`Asignar máquina a la OT ${ot.ot_number}`}
                          onChange={e => {
                            const m = e.target.value;
                            if (m) setAddingSlot({ otId: ot.id, machineId: m });
                          }}
                          className="h-6 rounded border border-input bg-card text-xs px-1 text-foreground"
                        >
                          <option value="">+ Máquina…</option>
                          {assignableGroups.map(group => (
                            <optgroup key={group.role} label={group.label}>
                              {group.machines.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      ) : (
                        <span className="text-muted-foreground text-[10px]">Cargando flota…</span>
                      )}
                    </td>
                  </tr>
                ))}

                {/* La fila de horarios se abre bajo la OT elegida, aunque esa
                    máquina todavía no tenga ninguna tarjeta en la hoja. */}
                {addingSlot && unscheduled.some((o: any) => o.id === addingSlot.otId) && (
                  <AddSlotRow
                    otId={addingSlot.otId}
                    machineId={addingSlot.machineId}
                    machineName={machineNameById.get(addingSlot.machineId)}
                    date={selectedDate}
                    ot={unscheduled.find((o: any) => o.id === addingSlot.otId) as OtHoursLike}
                    onDone={() => {
                      setAddingSlot(null);
                      refreshGoldenThread();
                    }}
                  />
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .hoja-print-root, .hoja-print-root * { visibility: visible; }
          .hoja-print-root { position: absolute; inset: 0; padding: 16px; }
          nav, header, aside { display: none !important; }
          .print\\:hidden { display: none !important; }
          table { font-size: 9px !important; }
          th, td { padding: 3px 5px !important; }
        }
      `}</style>
    </div>
  );
}
