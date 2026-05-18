'use client';

/**
 * OTGanttBoard — horizontal timeline of active OTs across a 4-week window.
 * Each row = one OT, bars show start→due_date span.
 * Purely CSS-based, no external Gantt library.
 */

import { useMemo } from 'react';
import { addDays, differenceInDays, format, startOfToday, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { useOTs } from '@/hooks/use-operations-queries';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const WINDOW_DAYS = 28; // 4 weeks shown

const STATUS_BAR: Record<string, string> = {
  pending:     'bg-slate-400',
  in_progress: 'bg-blue-500',
  review:      'bg-amber-500',
  completed:   'bg-green-500',
  cancelled:   'bg-red-400 opacity-50',
};

const STATUS_LABEL: Record<string, string> = {
  pending:     'Pendiente',
  in_progress: 'En proceso',
  review:      'Revisión',
  completed:   'Completado',
  cancelled:   'Cancelado',
};

export function OTGanttBoard() {
  const { data: otsRaw = [] } = useOTs();
  const today = startOfToday();
  const windowEnd = addDays(today, WINDOW_DAYS - 1);

  // Generate day headers
  const days = useMemo(() =>
    Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(today, i)),
    [today]
  );

  // Filter OTs that overlap the window and have dates
  const ots = useMemo(() => {
    return (otsRaw as any[])
      .filter(ot => {
        if (!ot.due_date) return false;
        const due = new Date(ot.due_date);
        const start = ot.created_at ? new Date(ot.created_at) : today;
        return due >= today && start <= windowEnd;
      })
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      .slice(0, 40); // cap at 40 rows for performance
  }, [otsRaw, today, windowEnd]);

  const dayPct = (date: Date) => {
    const offset = differenceInDays(date, today);
    return Math.max(0, Math.min(offset / WINDOW_DAYS, 1)) * 100;
  };

  const barStyle = (ot: any) => {
    const start = ot.created_at ? new Date(ot.created_at) : today;
    const due   = new Date(ot.due_date);
    const left  = dayPct(start < today ? today : start);
    const right = dayPct(due > windowEnd ? windowEnd : due);
    const width = Math.max(right - left, 1.5); // min 1.5% so tiny bars are visible
    return { left: `${left}%`, width: `${width}%` };
  };

  return (
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

        {/* Today line reference */}
        {ots.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No hay OTs con fechas de entrega en las próximas 4 semanas.
          </p>
        )}

        {/* OT rows */}
        <div className="space-y-1">
          {ots.map(ot => (
            <div key={ot.id} className="flex items-center h-8">
              {/* Label */}
              <div className="w-48 shrink-0 pr-2 flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-medium truncate">{ot.ot_number ?? ot.id}</span>
                <Badge
                  variant="outline"
                  className="text-[9px] shrink-0 hidden sm:block"
                >
                  {STATUS_LABEL[ot.status] ?? ot.status}
                </Badge>
              </div>

              {/* Bar track */}
              <div className="flex-1 relative h-5 bg-muted/30 rounded">
                {/* Today marker */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-primary/60 z-10"
                  style={{ left: '0%' }}
                />
                {/* Bar */}
                <div
                  className={cn(
                    'absolute top-1 bottom-1 rounded',
                    STATUS_BAR[ot.status] ?? 'bg-slate-400',
                  )}
                  style={barStyle(ot)}
                  title={`${ot.ot_number} — ${ot.client_name ?? ''} — Entrega: ${format(new Date(ot.due_date), 'dd MMM', { locale: es })}`}
                />
              </div>
            </div>
          ))}
        </div>

        {ots.length > 0 && (
          <p className="text-[10px] text-muted-foreground mt-3">
            Ventana: {format(today, 'dd MMM', { locale: es })} → {format(windowEnd, 'dd MMM yyyy', { locale: es })} · {ots.length} órdenes
          </p>
        )}
      </div>
    </div>
  );
}
