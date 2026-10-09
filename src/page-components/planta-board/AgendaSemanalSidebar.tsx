'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, CalendarDays, UploadCloud, CheckCircle2, ShieldAlert } from 'lucide-react';
import { CerrarDiaDialog } from '@/components/workflow/CerrarDiaDialog';
import { dateToLocalIso } from '@/lib/week-dates';

const calendarLocale = 'es-CL';
const formatWeekday = (date: Date) => date.toLocaleDateString(calendarLocale, { weekday: 'short' });
const formatDayLabel = (date: Date) => date.toLocaleDateString(calendarLocale, { day: '2-digit', month: '2-digit' });

export function AgendaSemanalSidebar({
  weekDates,
  selectedDate,
  setSelectedDate,
  weekStartIso,
  publishedWeeks,
  lastWeekValidation,
  onPreviousWeek,
  onNextWeek,
  onPublish,
  publishLoading,
}: {
  weekDates: Date[];
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  weekStartIso: string;
  publishedWeeks: Record<string, string>;
  lastWeekValidation: {
    weekStart: string;
    weekEnd: string;
    legalViolations: number;
    leaveViolations: number;
    details: string[];
  } | null;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onPublish: () => void;
  publishLoading: boolean;
}) {
  return (
    <Card className="bg-card/80 border-border backdrop-blur-sm p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">Agenda</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={onPreviousWeek} className="h-6 w-6 border-border bg-card/50 hover:bg-card">
            <ChevronLeft className="w-3 h-3" />
          </Button>
          <Button variant="outline" size="icon" onClick={onNextWeek} className="h-6 w-6 border-border bg-card/50 hover:bg-card">
            <ChevronRight className="w-3 h-3" />
          </Button>
          <Button size="sm" onClick={onPublish} disabled={publishLoading} className="h-6 px-2 text-[10px]">
            <UploadCloud className="w-3 h-3 mr-1" />
            {publishLoading ? '...' : 'Publicar'}
          </Button>
          {/* Turns the day's clock marks into real labour cost on each OT. */}
          <CerrarDiaDialog date={selectedDate} />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1 mb-2">
        {weekDates.map((date) => {
          const dateIso = dateToLocalIso(date);
          const isSelected = dateIso === selectedDate;
          const isToday = dateIso === dateToLocalIso(new Date());
          return (
            <button
              key={dateIso}
              onClick={() => setSelectedDate(dateIso)}
              className={`rounded px-1 py-1.5 text-center text-[10px] leading-tight transition-colors ${
                isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted/40 hover:bg-muted text-muted-foreground'
              }`}
            >
              <div className="font-medium uppercase">{formatWeekday(date)}</div>
              <div className={isToday ? 'font-bold' : ''}>{formatDayLabel(date)}</div>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1 text-[10px] mb-1">
        {publishedWeeks[weekStartIso] ? (
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle2 className="w-3 h-3" />
            Publicado
          </span>
        ) : (
          <span className="flex items-center gap-1 text-muted-foreground">
            <ShieldAlert className="w-3 h-3" />
            Sin publicar
          </span>
        )}
      </div>
      {lastWeekValidation && lastWeekValidation.weekStart === weekStartIso && (
        <div className={`rounded p-1.5 text-[10px] ${
          lastWeekValidation.legalViolations > 0 || lastWeekValidation.leaveViolations > 0
            ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-700'
        }`}>
          {lastWeekValidation.leaveViolations} ausencias · {lastWeekValidation.legalViolations} legales
        </div>
      )}
    </Card>
  );
}
