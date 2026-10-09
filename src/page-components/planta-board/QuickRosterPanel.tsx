'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight, RotateCcw, Copy } from 'lucide-react';
import { dateToLocalIso } from '@/lib/week-dates';

const QUICK_ROSTER_GUIDE_SESSION_KEY = 'workflow_quick_roster_guide_seen';

export function QuickRosterPanel({
  weekDates,
  selectedDate,
  selectedShiftId,
  quickSetupLoading,
  onRepeatLastWeek,
  onCopyFromDay,
}: {
  weekDates: Date[];
  selectedDate: string;
  selectedShiftId: string | null;
  quickSetupLoading: 'copy-day' | 'repeat-last-week' | null;
  onRepeatLastWeek: () => void;
  onCopyFromDay: (dateIso: string) => void;
}) {
  const [showGuide, setShowGuide] = useState(false);
  const [openedOnce, setOpenedOnce] = useState(false);

  useEffect(() => {
    const hasSeenGuide = sessionStorage.getItem(QUICK_ROSTER_GUIDE_SESSION_KEY) === '1';
    setShowGuide(!hasSeenGuide);
  }, []);

  if (!showGuide) return null;

  return (
    <details
      className="group"
      onToggle={(event) => {
        const isOpen = (event.currentTarget as HTMLDetailsElement).open;
        if (isOpen) {
          setOpenedOnce(true);
          return;
        }
        if (openedOnce) {
          sessionStorage.setItem(QUICK_ROSTER_GUIDE_SESSION_KEY, '1');
          setShowGuide(false);
        }
      }}
    >
      <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 list-none">
        <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90 shrink-0" />
        Configuración rápida
      </summary>
      <div className="mt-2 rounded-md border border-border p-3 bg-card/40 space-y-2">
        <Button variant="outline" size="sm" onClick={onRepeatLastWeek} disabled={!selectedShiftId || quickSetupLoading !== null} className="w-full h-7 text-xs">
          <RotateCcw className="w-3 h-3 mr-1" />
          {quickSetupLoading === 'repeat-last-week' ? 'Aplicando...' : 'Repetir semana anterior'}
        </Button>
        <div className="flex flex-wrap gap-1">
          {weekDates.map((date) => dateToLocalIso(date)).filter((d) => d !== selectedDate).map((dateIso) => (
            <Button key={`copy-${dateIso}`} variant="outline" size="sm" disabled={!selectedShiftId || quickSetupLoading !== null} onClick={() => onCopyFromDay(dateIso)} className="h-6 px-2 text-[10px]">
              <Copy className="w-2.5 h-2.5 mr-0.5" />
              {dateIso}
            </Button>
          ))}
        </div>
      </div>
    </details>
  );
}
