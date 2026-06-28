'use client';

/**
 * WeekendShiftRotation — lightweight weekly shift rotation.
 *
 * The shop runs two fixed shift templates (Día / Tarde). The weekend (Saturday)
 * shift is passed between workers one week at a time. This panel keeps an ordered
 * roster and derives who is on-call *deterministically* from the calendar week, so
 * it advances by exactly one position every week with no manual bookkeeping.
 *
 * NOTE: the roster is persisted to localStorage as a UI preference. It should move
 * to the DB (a `shift_rotation` table) so it is shared across devices — tracked in
 * docs/audit-2026-06.md (D2 / "localStorage as datastore").
 */

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarClock, ChevronUp, ChevronDown, X, Plus } from 'lucide-react';

const STORAGE_KEY = 'workshop_weekend_rotation';
const EPOCH = Date.UTC(2024, 0, 1); // Mon 2024-01-01 — fixed reference for week counting

/** Whole-week index since EPOCH, so the on-call worker advances once per week. */
function weekIndex(weekStart: Date): number {
  const ms = Date.UTC(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()) - EPOCH;
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
}

function loadRoster(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    /* ignore */
  }
  return [];
}

interface WeekendShiftRotationProps {
  workers: any[];
  weekStart: Date;
}

export function WeekendShiftRotation({ workers, weekStart }: WeekendShiftRotationProps) {
  const [roster, setRoster] = useState<string[]>(loadRoster);
  const [addId, setAddId] = useState<string>('');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(roster));
    } catch {
      /* ignore */
    }
  }, [roster]);

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of workers) map.set(String(w.id), w.name ?? '—');
    return map;
  }, [workers]);

  const mod = (n: number, m: number) => ((n % m) + m) % m;
  const idx = weekIndex(weekStart);
  const onCall = roster.length ? roster[mod(idx, roster.length)] : null;
  const onNext = roster.length ? roster[mod(idx + 1, roster.length)] : null;

  const available = workers.filter((w) => !roster.includes(String(w.id)));

  const add = () => {
    if (addId && !roster.includes(addId)) {
      setRoster([...roster, addId]);
      setAddId('');
    }
  };
  const remove = (id: string) => setRoster(roster.filter((r) => r !== id));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= roster.length) return;
    const next = [...roster];
    [next[i], next[j]] = [next[j], next[i]];
    setRoster(next);
  };

  return (
    <Card className="bg-card/80 border-border backdrop-blur-sm p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground">Turno de sábado · rotación semanal</span>
      </div>

      {roster.length > 0 ? (
        <div className="mb-2 rounded-md border border-primary/20 bg-primary/10 px-2 py-1.5">
          <p className="text-[11px] text-muted-foreground">Esta semana</p>
          <p className="text-sm font-bold text-foreground">{nameById.get(onCall as string) ?? '—'}</p>
          <p className="text-[10px] text-muted-foreground">Próximo: {nameById.get(onNext as string) ?? '—'}</p>
        </div>
      ) : (
        <p className="mb-2 text-[11px] text-muted-foreground">
          Agrega operarios al orden de rotación; cada semana el turno pasa al siguiente.
        </p>
      )}

      <div className="mb-2 space-y-1">
        {roster.map((id, i) => (
          <div
            key={id}
            className={`flex items-center gap-1 rounded px-1.5 py-1 text-xs ${id === onCall ? 'bg-primary/10' : 'bg-muted/30'}`}
          >
            <span className="w-4 text-[10px] text-muted-foreground">{i + 1}.</span>
            <span className="flex-1 truncate">{nameById.get(id) ?? '—'}</span>
            <button
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Subir"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              onClick={() => move(i, 1)}
              disabled={i === roster.length - 1}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Bajar"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
            <button
              onClick={() => remove(id)}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Quitar"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <Select value={addId} onValueChange={setAddId}>
          <SelectTrigger className="h-7 flex-1 text-xs">
            <SelectValue placeholder="Agregar operario…" />
          </SelectTrigger>
          <SelectContent>
            {available.map((w) => (
              <SelectItem key={w.id} value={String(w.id)}>
                {w.name ?? '—'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="icon" variant="outline" className="h-7 w-7" onClick={add} disabled={!addId}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  );
}
