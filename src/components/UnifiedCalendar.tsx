'use client';

/**
 * UnifiedCalendar — overlays OT deadlines + maintenance schedule + HR leaves
 * on a monthly/weekly calendar grid. Read-only, color-coded by source.
 */

import { useState } from 'react';
import {
  startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
  format, addMonths, subMonths, getDay, startOfWeek, endOfWeek,
  eachDayOfInterval as eachDay,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useOTs } from '@/hooks/use-operations-queries';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

type CalEvent = {
  date: Date;
  label: string;
  type: 'ot' | 'maintenance' | 'leave';
};

const EVENT_COLORS: Record<CalEvent['type'], string> = {
  ot:          'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  maintenance: 'bg-orange-500/20 text-orange-700 dark:text-orange-300',
  leave:       'bg-amber-500/20 text-amber-700 dark:text-amber-300',
};

function useMaintenanceEvents() {
  return useQuery({
    queryKey: ['calendar-maintenance'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('maintenance_work_orders')
        .select('id, title, scheduled_date, due_date')
        .not('scheduled_date', 'is', null);
      return (data ?? []).map((r: any) => ({
        date: new Date(r.scheduled_date ?? r.due_date),
        label: r.title ?? 'Mantenimiento',
        type: 'maintenance' as const,
      }));
    },
  });
}

function useLeaveEvents() {
  return useQuery({
    queryKey: ['calendar-leaves'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('leave_requests')
        .select('id, leave_type, start_date, employees(full_name)')
        .eq('status', 'approved')
        .not('start_date', 'is', null);
      return (data ?? []).map((r: any) => ({
        date: new Date(r.start_date),
        label: `${r.employees?.full_name ?? 'Empleado'} — ${r.leave_type ?? 'Licencia'}`,
        type: 'leave' as const,
      }));
    },
  });
}

export function UnifiedCalendar() {
  const [current, setCurrent] = useState(new Date());
  const { data: otsRaw = [] } = useOTs();
  const { data: maintenanceEvents = [] } = useMaintenanceEvents();
  const { data: leaveEvents = [] } = useLeaveEvents();

  // `ots` no tiene `due_date` — el campo real es `deadline`. Con el nombre
  // equivocado este filtro siempre daba vacío y ninguna OT aparecía nunca
  // en el calendario, silenciosamente.
  const otEvents: CalEvent[] = (otsRaw as any[])
    .filter(ot => ot.status !== 'completed' && ot.deadline)
    .map(ot => ({
      date: new Date(ot.deadline),
      label: `OT ${ot.ot_number ?? ot.id}`,
      type: 'ot' as const,
    }));

  const allEvents: CalEvent[] = [
    ...otEvents,
    ...(maintenanceEvents as CalEvent[]),
    ...(leaveEvents as CalEvent[]),
  ];

  const monthStart = startOfMonth(current);
  const monthEnd   = endOfMonth(current);

  // Pad to fill the grid rows (Mon-Sun)
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd    = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days       = eachDay({ start: gridStart, end: gridEnd });

  const eventsOnDay = (day: Date) =>
    allEvents.filter(e => isSameDay(e.date, day));

  const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold capitalize">
          {format(current, 'MMMM yyyy', { locale: es })}
        </h2>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCurrent(subMonths(current, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCurrent(addMonths(current, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />OTs</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />Mantenimiento</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Licencias</span>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden text-xs">
        {/* Day of week headers */}
        {DOW.map(d => (
          <div key={d} className="bg-muted/40 px-1 py-1.5 text-center font-medium text-muted-foreground">
            {d}
          </div>
        ))}

        {/* Day cells */}
        {days.map(day => {
          const events = eventsOnDay(day);
          const isCurrentMonth = day.getMonth() === current.getMonth();
          const isToday = isSameDay(day, new Date());
          return (
            <div
              key={day.toISOString()}
              className={cn(
                'bg-background min-h-[72px] p-1 space-y-0.5',
                !isCurrentMonth && 'opacity-30',
              )}
            >
              <div className={cn(
                'text-right text-[11px] font-medium px-0.5',
                isToday && 'bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center ml-auto',
              )}>
                {format(day, 'd')}
              </div>
              {events.slice(0, 3).map((ev, i) => (
                <div
                  key={i}
                  className={cn('rounded px-1 py-0.5 text-[10px] truncate leading-tight', EVENT_COLORS[ev.type])}
                  title={ev.label}
                >
                  {ev.label}
                </div>
              ))}
              {events.length > 3 && (
                <div className="text-[10px] text-muted-foreground px-1">+{events.length - 3} más</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
