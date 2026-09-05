'use client';

/**
 * OTGanttBoard — línea de tiempo horizontal de las OT activas, próximas 4
 * semanas. Cada fila es una OT; la barra va de cuándo se creó a su plazo.
 *
 * Estaba vacío no porque no hubiera OT: filtraba por `ot.due_date`, una
 * columna que no existe en `ots` (el campo real es `deadline`), así que el
 * filtro descartaba todo siempre. Los colores/etiquetas de estado también
 * venían de un vocabulario ajeno (`pending`, `in_progress`, `review`) que no
 * es el de esta app — se reemplaza por `otStatusLabel`/`otStatusHex`, la
 * fuente única para el enum real de `ot_status`.
 *
 * Y era de solo lectura. Un clic en una barra abre el plazo para editarlo
 * ahí mismo — la razón de ser de un cronograma es poder mover una fecha
 * cuando algo cambia, no solo mirarla.
 */

import { memo, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { addDays, differenceInDays, format, startOfToday, isValid as isValidDate } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { useOTs } from '@/hooks/use-operations-queries';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { otStatusLabel, otStatusHex, otStatusBadgeClass } from '@/lib/status-labels';
import { cn } from '@/lib/utils';

const WINDOW_DAYS = 28; // 4 weeks shown

function toDateInputValue(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return isValidDate(d) ? format(d, 'yyyy-MM-dd') : '';
}

// React.memo: guardar un plazo invalida ['ots'] y trae objetos `ot` nuevos
// para las 60 filas — sin memo, las 59 filas que no cambiaron se
// reconstruían igual. Las props que sí varían (left/width/overdue/canEdit)
// son primitivas, así que la comparación superficial de memo funciona sola.
const GanttRow = memo(function GanttRow({
  ot, left, width, overdue, canEdit,
}: {
  ot: any; left: number; width: number; overdue: boolean; canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => toDateInputValue(ot.deadline));
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const save = async () => {
    if (!draft) { toast.error('Elige una fecha'); return; }
    setSaving(true);
    const res = await fetch(`/api/ots/${ot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ deadline: `${draft}T23:59:59.000Z` }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? 'No se pudo actualizar el plazo');
      return;
    }
    toast.success(`Plazo de ${ot.ot_number} actualizado`);
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ['ots'] });
  };

  return (
    <div className="flex items-center h-8">
      {/* Label */}
      <div className="w-48 shrink-0 pr-2 flex items-center gap-1.5 min-w-0">
        <span className="text-xs font-medium truncate">{ot.ot_number ?? ot.id}</span>
        <Badge variant="outline" className={cn('text-[9px] shrink-0 hidden sm:inline-flex', otStatusBadgeClass(ot.status))}>
          {otStatusLabel(ot.status)}
        </Badge>
      </div>

      {/* Bar track */}
      <div className="flex-1 relative h-5 bg-muted/30 rounded">
        <div className="absolute top-0 bottom-0 w-px bg-primary/60 z-10" style={{ left: '0%' }} />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'absolute top-1 bottom-1 rounded transition-opacity hover:opacity-80',
                overdue && 'ring-2 ring-red-500',
              )}
              style={{ left: `${left}%`, width: `${width}%`, background: otStatusHex(ot.status) }}
              title={`${ot.ot_number} — ${ot.client_name ?? ''} — Entrega: ${ot.deadline ? format(new Date(ot.deadline), 'dd MMM', { locale: es }) : 'sin fecha'}${overdue ? ' (vencida)' : ''}`}
            />
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-3" align="start">
            <div>
              <p className="font-semibold text-sm text-foreground">{ot.ot_number} · {ot.client_name ?? '—'}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                {otStatusLabel(ot.status)}
                {overdue && (
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-3 w-3" /> vencida
                  </span>
                )}
              </p>
            </div>
            {canEdit ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Fecha de entrega</Label>
                <Input type="date" value={draft} onChange={(e) => setDraft(e.target.value)} className="h-8 text-sm" />
                <Button size="sm" className="w-full" onClick={save} disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar plazo'}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Entrega: {ot.deadline ? format(new Date(ot.deadline), "d 'de' MMMM yyyy", { locale: es }) : 'sin fecha'}
              </p>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
});

export function OTGanttBoard() {
  const { data: otsRaw = [], isError: otsError } = useOTs();
  const { role } = useAuth();
  // Mismo criterio que PlanSemanal: sólo admin/supervisor mueven fechas —
  // coincide con el rol que exige PATCH /api/ots/[id].
  const canEdit = role === 'admin' || role === 'supervisor';
  const today = startOfToday();
  const windowEnd = addDays(today, WINDOW_DAYS - 1);

  // `today`/`windowEnd` son objetos Date nuevos en cada render (startOfToday()
  // sin memo) — como dependencia de useMemo, un objeto nuevo nunca es
  // referencialmente igual al anterior, así que esto recalculaba en cada
  // render pese a la lista de dependencias. Se compara por su valor numérico,
  // que sí es estable mientras siga siendo el mismo día real (auditoría de
  // performance 2026-09).
  const days = useMemo(() =>
    Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(today, i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today.getTime()]
  );

  // Activas con plazo — vencidas incluidas: una OT atrasada es justo lo que
  // un cronograma tiene que mostrar primero, no lo que descarta por quedar
  // fuera de la ventana hacia adelante.
  const ots = useMemo(() => {
    return (otsRaw as any[])
      .filter((ot) => ot.status !== 'completed' && ot.deadline)
      .filter((ot) => isValidDate(new Date(ot.deadline)))
      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
      .slice(0, 60);
  }, [otsRaw]);

  const overdueCount = useMemo(
    () => ots.filter((ot) => new Date(ot.deadline) < today).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ots, today.getTime()],
  );

  const dayPct = (date: Date) => {
    const offset = differenceInDays(date, today);
    return Math.max(0, Math.min(offset / WINDOW_DAYS, 1)) * 100;
  };

  const barGeometry = (ot: any) => {
    const due = new Date(ot.deadline);
    const overdue = due < today;
    const start = ot.created_at ? new Date(ot.created_at) : today;
    const left = overdue ? dayPct(today) : dayPct(start < today ? today : start);
    const right = overdue ? dayPct(today) : dayPct(due > windowEnd ? windowEnd : due);
    const width = Math.max(right - left, 1.5); // min 1.5% so tiny/overdue bars are visible
    return { left, width, overdue };
  };

  // Calculado una vez por lista, no reconstruido inline en cada `.map()` del
  // render — sin esto, cada render (incluido el de las hasta 60 filas
  // memoizadas de abajo) recalculaba la geometría de las 60 barras aunque
  // `ots` no hubiera cambiado.
  const rowGeometry = useMemo(
    () => new Map(ots.map((ot) => [ot.id, barGeometry(ot)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ots, today.getTime(), windowEnd.getTime()],
  );

  return (
    <div className="space-y-2">
      {overdueCount > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          {overdueCount} OT{overdueCount === 1 ? '' : 's'} con plazo vencido, marcada{overdueCount === 1 ? '' : 's'} en rojo al inicio de la línea.
        </p>
      )}
      {!canEdit && (
        <p className="text-xs text-muted-foreground">
          Vista de solo lectura: solo admin y supervisor pueden mover plazos desde acá.
        </p>
      )}
      <div className="overflow-x-auto">
        <div style={{ minWidth: 700 }}>
          {/* Day header */}
          <div className="flex border-b border-border pb-1 mb-2">
            <div className="w-48 shrink-0 text-xs text-muted-foreground pr-2">OT</div>
            <div className="flex-1 relative">
              <div className="flex">
                {days.map((d, i) => (
                  <div
                    key={i}
                    style={{ width: `${100 / WINDOW_DAYS}%` }}
                    className={cn(
                      'text-center text-[9px] text-muted-foreground truncate shrink-0 px-px',
                      differenceInDays(d, today) === 0 && 'font-bold text-primary',
                    )}
                  >
                    {i === 0 || d.getDate() === 1 || i % 7 === 0
                      ? format(d, 'd MMM', { locale: es })
                      : ''}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* "No hay OT activas" es la misma frase para un 401, un 500 y un
              taller genuinamente sin trabajo cargado — el auditor de
              seguridad lo señaló como el ejemplo más literal de la
              ambigüedad que este pase entero persigue. Rama aparte para el
              error, no una condición más del mismo párrafo (auditoría 2026-08). */}
          {otsError ? (
            <p className="text-sm text-destructive py-4 text-center">
              No se pudieron cargar las OTs. Puede ser un problema de permisos o de conexión — no significa que no haya trabajo cargado.
            </p>
          ) : ots.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No hay OT activas con plazo cargado.
            </p>
          )}

          {/* OT rows */}
          <div className="space-y-1">
            {ots.map((ot) => {
              const { left, width, overdue } = rowGeometry.get(ot.id)!;
              return <GanttRow key={ot.id} ot={ot} left={left} width={width} overdue={overdue} canEdit={canEdit} />;
            })}
          </div>

          {ots.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-3">
              Ventana: {format(today, 'dd MMM', { locale: es })} → {format(windowEnd, 'dd MMM yyyy', { locale: es })} · {ots.length} órdenes activas
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
