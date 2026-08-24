'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useWeekSchedule } from '@/hooks/use-workflow-queries';
import { useRealtimeProduction } from '@/hooks/use-realtime-production';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { AdvanceFlags } from '@/components/workflow/AdvanceFlags';
import { CalendarCheck2, ChevronLeft, ChevronRight, Printer, RefreshCw, Wifi, WifiOff } from 'lucide-react';
// Antes reimplementado acá — ver src/lib/week-dates.ts (auditoría 2026-08).
import { dateToLocalIso as toIsoDate, startOfIsoWeek as getWeekStart } from '@/lib/week-dates';

const COLOR_VALUE: Record<string, string> = {
  cmyk: '4',
  '1_color': '1',
  '2_color': '2',
  '3_color': '3',
  cmyk_pantone: '4+P',
  sin_impresion: '0',
};

function formatColor(front?: string | null, back?: string | null) {
  if (!front) return '-';
  return `${COLOR_VALUE[front] ?? '?'}/${COLOR_VALUE[back ?? ''] ?? '0'}`;
}

function formatTime(value?: string | null) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(value: string) {
  const dt = new Date(`${value}T12:00:00`);
  return dt.toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function replaceDateKeepingUtcTime(targetDate: string, sourceIso?: string | null) {
  if (!sourceIso) return null;
  const source = new Date(sourceIso);
  const target = new Date(`${targetDate}T00:00:00.000Z`);
  target.setUTCHours(
    source.getUTCHours(),
    source.getUTCMinutes(),
    source.getUTCSeconds(),
    source.getUTCMilliseconds()
  );
  return target.toISOString();
}

function isOverdue(deadline?: string | null) {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

export function PlanSemanal() {
  const [weekStart, setWeekStart] = useState(() => toIsoDate(getWeekStart(new Date())));
  const { data, isLoading, isError, refetch } = useWeekSchedule(weekStart);
  const { isConnected } = useRealtimeProduction();
  const { role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draggingSlotId, setDraggingSlotId] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const canReorderPlan = role === 'admin' || role === 'supervisor';

  const moveWeek = (deltaDays: number) => {
    const base = new Date(`${weekStart}T12:00:00`);
    base.setDate(base.getDate() + deltaDays);
    setWeekStart(toIsoDate(getWeekStart(base)));
  };

  const machineRows = data?.machine_rows ?? [];
  const weekDays = data?.days ?? [];
  const unscheduled = data?.unscheduled ?? [];
  const shiftHours = data?.shift_hours ?? 9;
  const publishedSnapshot = data?.published_snapshot ?? null;

  const moveSlot = async (slot: any, targetMachineId: string, targetDate: string) => {
    if (!slot?.id) return;
    if (slot.machine_id === targetMachineId && String(slot.scheduled_start ?? '').slice(0, 10) === targetDate) {
      return;
    }

    const nextStart = replaceDateKeepingUtcTime(targetDate, slot.scheduled_start);
    const nextEnd = replaceDateKeepingUtcTime(targetDate, slot.scheduled_end);

    const res = await fetch(`/api/ot-schedule/${slot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        machine_id: targetMachineId,
        scheduled_start: nextStart,
        scheduled_end: nextEnd,
      }),
    });

    if (!res.ok) {
      toast({ title: 'Error al mover OT', variant: 'destructive' });
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ['schedule'] });
    setDropTargetKey(null);
    toast({ title: 'OT reprogramada', description: 'La OT se movio en el plan semanal.' });
  };

  const publishWeek = async () => {
    setPublishing(true);
    const res = await fetch('/api/ot-schedule/week/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_start: weekStart }),
    });
    setPublishing(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast({ title: 'Error al publicar semana', description: body?.error ?? 'Request failed', variant: 'destructive' });
      return;
    }

    const body = await res.json().catch(() => null);
    await queryClient.invalidateQueries({ queryKey: ['schedule', 'week', weekStart] });
    toast({
      title: 'Semana publicada',
      description: `Version ${body?.snapshot?.version ?? '?'} con ${body?.lines_count ?? 0} lineas`,
    });
  };

  return (
    <div className="space-y-4">
      <Card className="bg-card/80 border-border backdrop-blur-sm p-3 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => moveWeek(-7)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              className="h-8 w-36 text-sm"
            />
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => moveWeek(7)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setWeekStart(toIsoDate(getWeekStart(new Date())))}>
              Semana actual
            </Button>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {isConnected ? (
              <>
                <Wifi className="h-3.5 w-3.5 text-green-500" />
                <span className="text-xs text-green-600">En vivo</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Desconectado</span>
              </>
            )}
          </div>

          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
          <Button variant="default" size="sm" className="h-8 gap-1.5" onClick={publishWeek} disabled={publishing}>
            <CalendarCheck2 className="h-4 w-4" />
            {publishing ? 'Publicando...' : 'Publicar Semana'}
          </Button>
        </div>
        {!canReorderPlan && (
          <p className="mt-2 text-xs text-muted-foreground">
            Vista de solo lectura: solo admin y supervisor pueden reprogramar OTs con arrastrar y soltar.
          </p>
        )}
      </Card>

      {publishedSnapshot && (
        <Card className="bg-emerald-500/10 border-emerald-500/30 p-3 print:hidden">
          <p className="text-xs text-emerald-800">
            Publicada version {publishedSnapshot.version} el{' '}
            {new Date(publishedSnapshot.published_at).toLocaleString('es-CL')}
          </p>
        </Card>
      )}

      <div className="hidden print:block text-center">
        <h1 className="text-xl font-bold uppercase tracking-wide">Plan Semanal de Produccion</h1>
        <p className="text-xs text-gray-600">
          {data?.week_start} al {data?.week_end}
        </p>
      </div>

      {isError ? (
        // Antes un 403/500 caía al mismo `data ?? []` que una semana
        // genuinamente sin programar — un hr_manager que llegaba a esta
        // pestaña veía una grilla vacía, no un error, sin ninguna pista de
        // que la consulta había fallado (auditoría 2026-08). El toast
        // global de providers.tsx ya avisa, pero la pantalla en sí también
        // tiene que decirlo, no quedarse en un plan en blanco creíble.
        <Card className="border-destructive/40 bg-destructive/5 p-10 text-center text-sm text-destructive">
          No se pudo cargar el plan semanal. Puede ser que tu rol no tenga acceso a esta vista, o un problema de conexión.
          <Button variant="outline" size="sm" className="mt-3 block mx-auto" onClick={() => refetch()}>
            Reintentar
          </Button>
        </Card>
      ) : isLoading ? (
        <Card className="bg-card/80 border-border p-10 text-center text-muted-foreground text-sm">
          Cargando plan semanal...
        </Card>
      ) : (
        <Card className="bg-card/80 border-border backdrop-blur-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1240px] text-xs border-collapse print:text-[10px]">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-muted-foreground uppercase tracking-wide text-[10px]">
                  <th className="px-3 py-2 text-left w-[180px] sticky left-0 bg-muted/20 z-20">Maquina</th>
                  {weekDays.map((date: string) => (
                    <th key={date} className="px-2 py-2 text-left min-w-[150px]">
                      {formatDateLabel(date)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {machineRows.map((row: any, idx: number) => (
                  <tr key={row.machine.id} className={`align-top border-b border-border/50 ${idx % 2 === 0 ? '' : 'bg-muted/5'}`}>
                    <td className="px-3 py-2 sticky left-0 bg-card z-10 border-r border-border/60">
                      <div className="font-semibold text-foreground">{row.machine.name}</div>
                      <div className="text-[10px] text-muted-foreground">{row.machine.type}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-[10px]">
                          {row.slot_count} OT
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] ${row.overloaded_days > 0 ? 'bg-red-500/10 text-red-700 border-red-500/30' : ''}`}>
                          {row.planned_hours_total.toFixed(1)}h
                        </Badge>
                      </div>
                    </td>
                    {row.days.map((day: any) => (
                      (() => {
                        const dayKey = `${row.machine.id}__${day.date}`;
                        const isDropTarget = dropTargetKey === dayKey;
                        return (
                      <td
                        key={day.date}
                        className={`px-1.5 py-1.5 border-l border-border/30 transition-colors ${day.is_overloaded ? 'bg-red-500/5' : ''} ${isDropTarget ? 'bg-primary/10 ring-2 ring-inset ring-primary/40' : ''}`}
                        onDragOver={(e) => {
                          if (!canReorderPlan || !draggingSlotId) return;
                          e.preventDefault();
                          if (dropTargetKey !== dayKey) setDropTargetKey(dayKey);
                        }}
                        onDragEnter={() => {
                          if (!canReorderPlan || !draggingSlotId) return;
                          setDropTargetKey(dayKey);
                        }}
                        onDragLeave={() => {
                          if (dropTargetKey === dayKey) setDropTargetKey(null);
                        }}
                        onDrop={async () => {
                          if (!canReorderPlan) return;
                          if (!draggingSlotId) return;
                          const slot = machineRows
                            .flatMap((mr: any) => mr.days.flatMap((d: any) => d.slots))
                            .find((s: any) => s.id === draggingSlotId);
                          setDraggingSlotId(null);
                          setDropTargetKey(null);
                          if (!slot) return;
                          await moveSlot(slot, row.machine.id, day.date);
                        }}
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span className={`text-[10px] font-mono ${day.is_overloaded ? 'text-red-700 font-semibold' : 'text-muted-foreground'}`}>
                            {day.planned_hours.toFixed(1)}/{shiftHours}h
                          </span>
                          {isDropTarget && canReorderPlan && (
                            <span className="text-[9px] font-semibold text-primary">Soltar aqui</span>
                          )}
                        </div>
                        <div className="space-y-1.5 min-h-[84px]">
                          {day.slots.length === 0 ? (
                            <div className="text-[10px] text-muted-foreground italic">-</div>
                          ) : (
                            day.slots.map((slot: any) => {
                              const ot = slot.ot;
                              const overdue = isOverdue(ot?.deadline);
                              const missingPaper = !ot?.flag_paper_arrived;
                              return (
                                <div
                                  key={slot.id}
                                  draggable={canReorderPlan}
                                  onDragStart={() => {
                                    if (!canReorderPlan) return;
                                    setDraggingSlotId(slot.id);
                                  }}
                                  onDragEnd={() => {
                                    setDraggingSlotId(null);
                                    setDropTargetKey(null);
                                  }}
                                  className={`rounded border p-1.5 text-[10px] leading-tight ${
                                    missingPaper
                                      ? 'bg-amber-500/10 border-amber-500/30'
                                      : overdue
                                      ? 'bg-red-500/10 border-red-500/30'
                                      : 'bg-card border-border/70'
                                  } ${draggingSlotId === slot.id ? 'opacity-40' : ''} ${canReorderPlan ? 'cursor-move' : 'cursor-default'}`}
                                >
                                  <div className="font-mono font-bold text-foreground">{ot?.ot_number ?? '-'}</div>
                                  <div className="font-medium text-foreground truncate">{ot?.client_name ?? '-'}</div>
                                  <div className="text-muted-foreground truncate">{ot?.product_name || ot?.description || '-'}</div>
                                  <div className="mt-0.5 text-muted-foreground">
                                    {(ot?.quantity ?? 0).toLocaleString('es-CL')} u | {formatColor(ot?.color_front, ot?.color_back)}
                                  </div>
                                  <div className="mt-0.5 text-muted-foreground">
                                    {formatTime(slot.scheduled_start)}-{formatTime(slot.scheduled_end)} | {Number(slot.hours_override ?? slot.estimated_hours ?? 0).toFixed(1)}h
                                  </div>
                                  <div className="mt-1">
                                    {/* Read-only: planning view must never mutate
                                        production state on a stray click. */}
                                    <AdvanceFlags ot={ot ?? {}} readOnly size="sm" />
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </td>
                        );
                      })()
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {unscheduled.length > 0 && (
        <Card className="bg-card/80 border-border backdrop-blur-sm p-4 print:hidden">
          <h3 className="text-sm font-bold text-foreground mb-2">
            OTs activas sin programar en la semana ({unscheduled.length})
          </h3>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {unscheduled.slice(0, 12).map((ot: any) => (
              <div key={ot.id} className="rounded border border-border p-2 bg-muted/10 text-xs">
                <div className="font-mono font-semibold text-foreground">{ot.ot_number}</div>
                <div className="font-medium text-foreground truncate">{ot.client_name}</div>
                <div className="text-muted-foreground truncate">{ot.product_name || ot.description || '-'}</div>
              </div>
            ))}
          </div>
          {unscheduled.length > 12 && (
            <p className="text-xs text-muted-foreground mt-2">Mostrando 12 de {unscheduled.length} OTs sin programar.</p>
          )}
        </Card>
      )}
    </div>
  );
}
