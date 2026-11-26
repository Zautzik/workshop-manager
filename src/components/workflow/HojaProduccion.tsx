'use client';

/**
 * Hoja de Producción — the Cronograma's plan for one day, as a sheet to print.
 *
 * It used to read the manual slots in `ot_machine_schedule` on its own and
 * let people add and delete them here, while the Cronograma planned from the
 * OTs' routes: two schedules that never met, and the sheet was empty on days
 * the Cronograma had 28 OTs planned (audit C3, 2026-11-25).
 *
 * Now it shows exactly the blocks the Cronograma computes
 * (useProductionSchedule → buildSchedule), grouped by machine and clipped to
 * the day. Placing or moving work is done in Planificación — pinning a block
 * there is what writes `ot_machine_schedule`.
 *
 * Kept from the old sheet (owner, 2026-11-26): the ORD→PAP advance control
 * (same PATCH as Órdenes en Proceso), the paper type and the press-sheet size.
 * Paper and sheet come from the pinned slot when there is one (what was typed
 * when pinning), else from the OT's other slots / its substrate.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AdvanceFlags } from '@/components/workflow/AdvanceFlags';
import { useToast } from '@/hooks/use-toast';
import { queryKeys } from '@/hooks/use-workflow-queries';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Printer, RefreshCw, Pin, AlertTriangle, Wrench, CalendarRange } from 'lucide-react';
import { useProductionSchedule } from '@/hooks/use-production-schedule';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { dateToLocalIso } from '@/lib/week-dates';
import { plantWallClockToMs, workingHoursBetween } from '@/lib/plant-calendar';
import { formatPlantTime } from '@/lib/production-plan';
import { PLAN_STEP_BY_KEY } from '@/lib/production-route';
import type { Block, Lane, MaintenanceBlock } from '@/lib/production-scheduler';

const COLOR_VALUE: Record<string, string> = {
  cmyk: '4', '1_color': '1', '2_color': '2', '3_color': '3',
  cmyk_pantone: '4+P', sin_impresion: '0',
};
function formatColor(front?: string | null, back?: string | null) {
  if (!front) return '—';
  return `${COLOR_VALUE[front] ?? '?'}/${COLOR_VALUE[back ?? ''] ?? '0'}`;
}
function fmtDate(d?: string | null) {
  if (!d) return '—';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '—' : x.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });
}
const fmtH = (h: number) => h.toLocaleString('es-CL', { maximumFractionDigits: 1 });

/** Start and end of a plant calendar day ("YYYY-MM-DD"), in ms. */
function dayBounds(date: string): [number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [plantWallClockToMs(y, m, d, 0), plantWallClockToMs(y, m, d + 1, 0)];
}

interface LaneDay {
  lane: Lane;
  blocks: Block[];
  maintenance: MaintenanceBlock[];
  hours: number;
  available: number;
}

export function HojaProduccion() {
  const [selectedDate, setSelectedDate] = useState(dateToLocalIso(new Date()));
  const { schedule, plan, data: payload, isLoading, isError, error, refetch, isFetching } = useProductionSchedule();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // The same write as Órdenes en Proceso: PATCH the OT, then refresh both the
  // plan (Hoja, Cronograma) and every OT list (Tablero, En Proceso).
  const patchFlag = useCallback(async (otId: string, flag: string, value: boolean) => {
    const res = await fetch(`/api/ots/${otId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [flag]: value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast({ title: 'Error al guardar', description: body?.error, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['planificacion'] });
    queryClient.invalidateQueries({ queryKey: queryKeys.ots });
  }, [queryClient, toast]);

  // Paper and sheet size: from the slot pinned for this block, else from any
  // slot of the OT (sheet), else the OT's substrate + grammage (paper).
  const slotInfo = useMemo(() => {
    const bySlot = new Map<string, { paper: string | null; sheet: string | null }>();
    const byOt = new Map<string, { paper: string | null; sheet: string | null }>();
    for (const pin of payload?.pins ?? []) {
      const sheet = pin.sheetWidthCm && pin.sheetHeightCm ? `${pin.sheetWidthCm}×${pin.sheetHeightCm}` : null;
      const info = { paper: pin.paperLabel ?? null, sheet };
      bySlot.set(pin.slotId, info);
      const prev = byOt.get(pin.otId);
      byOt.set(pin.otId, { paper: prev?.paper ?? info.paper, sheet: prev?.sheet ?? info.sheet });
    }
    return { bySlot, byOt };
  }, [payload]);
  const [dayStart, dayEnd] = useMemo(() => dayBounds(selectedDate), [selectedDate]);

  const otById = useMemo(() => new Map((plan?.ots ?? []).map((o) => [o.id, o as any])), [plan]);

  const lanes: LaneDay[] = useMemo(() => {
    if (!schedule) return [];
    const overlaps = (a: number, b: number) => a < dayEnd && b > dayStart;
    return schedule.lanes
      .map((lane) => {
        const blocks = schedule.blocks
          .filter((b) => b.laneId === lane.id && overlaps(b.start, b.end))
          .sort((a, b) => a.start - b.start);
        const maintenance = schedule.maintenance.filter((m) => m.laneId === lane.id && overlaps(m.start, m.end));
        const within = (s: number, e: number) => workingHoursBetween(lane.calendar, Math.max(s, dayStart), Math.min(e, dayEnd));
        const hours = blocks.reduce((s, b) => s + within(b.start, b.end), 0) + maintenance.reduce((s, m) => s + within(m.start, m.end), 0);
        const available = workingHoursBetween(lane.calendar, dayStart, dayEnd);
        return { lane, blocks, maintenance, hours, available };
      })
      .filter((l) => l.blocks.length > 0 || l.maintenance.length > 0);
  }, [schedule, dayStart, dayEnd]);

  const moveDate = (delta: number) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    setSelectedDate(dateToLocalIso(d));
  };
  const printDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-CL', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const totalOts = new Set(lanes.flatMap((l) => l.blocks.map((b) => b.otId))).size;

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card/80 p-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Día anterior" onClick={() => moveDate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="h-9 w-36 text-sm" />
            <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Día siguiente" onClick={() => moveDate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => setSelectedDate(dateToLocalIso(new Date()))}>
              Hoy
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">
            {totalOts} OT{totalOts !== 1 ? 's' : ''} en {lanes.length} máquina{lanes.length !== 1 ? 's' : ''}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
              <Link href="/operaciones/calendar"><CalendarRange className="h-4 w-4" /> Ajustar en Planificación</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1.5" disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Actualizar
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} className="h-9 gap-1.5">
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
          </div>
        </div>
      </Card>

      <div className="mb-2 hidden text-center print:block">
        <h1 className="text-xl font-bold uppercase tracking-wide">Hoja de Producción</h1>
        <p className="text-sm capitalize text-gray-600">{printDate}</p>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Cargando el programa…</div>
      ) : isError ? (
        <Card className="p-6 text-center text-sm text-destructive">{(error as Error)?.message ?? 'No se pudo cargar el programa.'}</Card>
      ) : lanes.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          El programa no tiene trabajo para este día.
          <p className="mt-1 text-xs">El Cronograma reparte las OTs activas según su ruta; si falta alguna, revísala en Planificación.</p>
        </Card>
      ) : (
        lanes.map(({ lane, blocks, maintenance, hours, available }) => {
          const over = available > 0 && hours > available + 0.05;
          const pct = available > 0 ? Math.min(100, (hours / available) * 100) : 0;
          return (
            <Card key={lane.id} className="overflow-hidden border-border bg-card/80 break-inside-avoid">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">
                  {lane.name}
                  {lane.virtual && <span className="ml-2 text-xs font-normal normal-case text-muted-foreground">(sin máquina en la flota)</span>}
                </h3>
                <div className="flex min-w-[180px] items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${over ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`font-mono text-xs font-semibold tabular-nums ${over ? 'text-destructive' : 'text-foreground'}`}>
                    {fmtH(hours)}/{fmtH(available)} h
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/20 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="w-[150px] px-2 py-2 text-left print:hidden">Avance</th>
                      <th className="w-[90px] px-2 py-2 text-left">Horario</th>
                      <th className="w-[70px] px-2 py-2 text-left">O.T.</th>
                      <th className="px-2 py-2 text-left">Cliente</th>
                      <th className="px-2 py-2 text-left">Trabajo</th>
                      <th className="px-2 py-2 text-left">Etapa</th>
                      <th className="w-[70px] px-2 py-2 text-right">Cant.</th>
                      <th className="w-[50px] px-2 py-2 text-center">Color</th>
                      <th className="px-2 py-2 text-left">Tipo papel</th>
                      <th className="w-[70px] px-2 py-2 text-center">Medio</th>
                      <th className="w-[60px] px-2 py-2 text-right">Pliegos</th>
                      <th className="w-[45px] px-2 py-2 text-right">HRS</th>
                      <th className="w-[55px] px-2 py-2 text-center">Entrega</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maintenance.map((m) => (
                      <tr key={`m-${m.id}`} className="border-b border-border/50 bg-amber-500/5">
                        <td className="whitespace-nowrap px-2 py-1.5 font-mono">
                          {formatPlantTime(Math.max(m.start, dayStart))}–{formatPlantTime(Math.min(m.end, dayEnd))}
                        </td>
                        <td className="print:hidden" />
                        <td colSpan={11} className="px-2 py-1.5 text-amber-700 dark:text-amber-400">
                          <Wrench className="mr-1 inline h-3 w-3" /> Mantención: {m.title} ({fmtH(m.hours)} h)
                        </td>
                      </tr>
                    ))}
                    {blocks.map((b, idx) => {
                      const ot = otById.get(b.otId);
                      const late = !!ot?.deadline && new Date(ot.deadline).getTime() < b.end;
                      const continues = b.end > dayEnd;
                      const started = b.start < dayStart;
                      const pinned = b.slotId ? slotInfo.bySlot.get(b.slotId) : undefined;
                      const anySlot = slotInfo.byOt.get(b.otId);
                      const otPaper = ot?.substrate_type ? `${ot.substrate_type}${ot.grammage_gsm ? ` ${ot.grammage_gsm} g` : ''}` : null;
                      const paper = pinned?.paper ?? otPaper ?? anySlot?.paper ?? null;
                      const sheet = pinned?.sheet ?? anySlot?.sheet ?? null;
                      return (
                        <tr key={b.id} className={`border-b border-border/50 ${!ot?.flag_paper_arrived ? 'bg-amber-500/5' : idx % 2 ? 'bg-muted/5' : ''}`}>
                          <td className="px-2 py-1.5 print:hidden">
                            {ot && (
                              <AdvanceFlags
                                ot={ot}
                                size="sm"
                                onAdvance={(key) => patchFlag(ot.id, key, true)}
                                onUndo={(key) => patchFlag(ot.id, key, false)}
                              />
                            )}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 font-mono text-foreground">
                            {started ? '…' : ''}{formatPlantTime(Math.max(b.start, dayStart))}–{formatPlantTime(Math.min(b.end, dayEnd))}{continues ? '…' : ''}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 font-mono font-semibold text-foreground">
                            {ot?.ot_number ?? '—'}
                            {b.pinned && <Pin className="ml-1 inline h-3 w-3 text-primary" aria-label="Fijada a mano" />}
                          </td>
                          <td className="px-2 py-1.5 font-medium text-foreground">{ot?.client_name ?? '—'}</td>
                          <td className="max-w-[180px] px-2 py-1.5 text-foreground"><span className="line-clamp-2">{ot?.product_name || '—'}</span></td>
                          <td className="px-2 py-1.5">
                            {PLAN_STEP_BY_KEY[b.step]?.label ?? b.step}
                            {b.inProgress && <span className="ml-1 text-emerald-600 dark:text-emerald-400">· en curso</span>}
                            {b.conflict && (
                              <span className="mt-0.5 flex items-center gap-1 text-destructive" title={b.conflict}>
                                <AlertTriangle className="h-3 w-3 shrink-0" /> {b.conflict}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{ot?.quantity != null ? Number(ot.quantity).toLocaleString('es-CL') : '—'}</td>
                          <td className="px-2 py-1.5 text-center font-mono">{formatColor(ot?.color_front, ot?.color_back)}</td>
                          <td className="px-2 py-1.5 text-foreground">{paper ?? '—'}</td>
                          <td className="px-2 py-1.5 text-center font-mono text-muted-foreground">{sheet ?? '—'}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{ot?.calc_sheets != null ? Number(ot.calc_sheets).toLocaleString('es-CL') : '—'}</td>
                          <td className="px-2 py-1.5 text-right font-mono" title={`Estimado por ${b.source}`}>{fmtH(b.hours)}</td>
                          <td className={`px-2 py-1.5 text-center tabular-nums ${late ? 'font-semibold text-destructive' : 'text-foreground'}`}>
                            {fmtDate(ot?.deadline)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })
      )}

      <p className="text-xs text-muted-foreground print:hidden">
        <Pin className="mr-1 inline h-3 w-3" /> = horario fijado a mano en Planificación; el resto lo reparte el Cronograma según la ruta y las horas estimadas.
        Un «…» indica que la etapa empieza el día anterior o sigue al siguiente.
      </p>

      <style>{`
        @media print {
          nav, header, aside { display: none !important; }
          table { font-size: 9px !important; }
          th, td { padding: 3px 5px !important; }
        }
      `}</style>
    </div>
  );
}
