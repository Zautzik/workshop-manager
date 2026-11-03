'use client';

/**
 * Turnos habituales por máquina — el patrón que usa el Cronograma cuando una
 * máquina no tiene dotación cargada ese día (`machine-calendar.ts`).
 *
 * Una celda por máquina y turno, que rota entre «—» (no lo trabaja), «L–V» y
 * «L–S». Es el caso de todos los días; lo puntual —abrir la Noche del jueves
 * en la Ryobi— no se hace acá sino asignando operarios a ese turno ese día,
 * en el tablero de al lado.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';

import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ShiftDefLike {
  id: string;
  code?: string | null;
  name: string;
  start_time: string;
  end_time: string;
}

interface MachineLike {
  id: string;
  name: string;
  type?: string | null;
}

interface Pattern {
  machine_id: string;
  shift_id: string;
  weekdays: number[];
}

const LV = [1, 2, 3, 4, 5];
const LS = [1, 2, 3, 4, 5, 6];
const DIAS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function daysLabel(days: number[] | undefined): string {
  if (!days || days.length === 0) return '—';
  const sorted = [...days].sort();
  if (same(sorted, LV)) return 'L–V';
  if (same(sorted, LS)) return 'L–S';
  return sorted.map((d) => DIAS[d]).join('');
}

/** Lo que pasa al hacer clic: — → L–V → L–S → —. Un patrón a medida vuelve a «—». */
function nextDays(days: number[] | undefined): number[] {
  const sorted = [...(days ?? [])].sort();
  if (sorted.length === 0) return LV;
  if (same(sorted, LV)) return LS;
  return [];
}

const hh = (t: string) => t.slice(0, 2);

export function MachineShiftPatternsPanel({
  machines,
  shifts,
  canEdit,
}: {
  machines: MachineLike[];
  shifts: ShiftDefLike[];
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const definitions = shifts.filter((s) => s.code);

  const { data } = useQuery<{ patterns: Pattern[]; available: boolean }>({
    queryKey: ['shift-patterns'],
    queryFn: async () => {
      const res = await fetch('/api/shift-patterns');
      if (!res.ok) throw new Error(`No se pudo cargar el patrón de turnos (${res.status})`);
      return res.json();
    },
  });

  // Antes de la migración de turnos no hay definiciones ni patrón: no se ofrece
  // una grilla que no se puede guardar.
  if (definitions.length === 0 || data?.available === false) return null;

  const byKey = new Map((data?.patterns ?? []).map((p) => [`${p.machine_id}|${p.shift_id}`, p.weekdays]));

  const toggle = async (machine: MachineLike, shift: ShiftDefLike) => {
    const key = `${machine.id}|${shift.id}`;
    const weekdays = nextDays(byKey.get(key));
    setSaving(key);
    const res = await fetch('/api/shift-patterns', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machine_id: machine.id, shift_id: shift.id, weekdays }),
    });
    setSaving(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast({ title: 'No se pudo guardar', description: body?.error ?? `El servidor respondió ${res.status}.`, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['shift-patterns'] });
    // El Cronograma programa con este patrón: que se reacomode ya.
    queryClient.invalidateQueries({ queryKey: ['planificacion'] });
  };

  return (
    <details className="group">
      <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 list-none">
        <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90 shrink-0" />
        Turnos habituales por máquina
      </summary>
      <div className="mt-2 rounded-md border border-border bg-card/40 p-2">
        <p className="mb-2 text-[10px] leading-snug text-muted-foreground">
          Lo que el Cronograma supone cuando no hay dotación cargada. Para abrir una noche puntual, asigna operarios al turno
          Noche ese día.
        </p>
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-muted-foreground">
              <th className="pb-1 text-left font-medium">Máquina</th>
              {definitions.map((s) => (
                <th key={s.id} className="pb-1 text-center font-medium" title={`${s.name} ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`}>
                  {s.name}
                  <div className="font-normal opacity-70">
                    {hh(s.start_time)}–{hh(s.end_time)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {machines.map((m) => (
              <tr key={m.id} className="border-t border-border/50">
                <td className="max-w-[90px] truncate py-0.5 pr-1" title={m.name}>
                  {m.name}
                </td>
                {definitions.map((s) => {
                  const key = `${m.id}|${s.id}`;
                  const days = byKey.get(key);
                  const on = !!days && days.length > 0;
                  return (
                    <td key={s.id} className="py-0.5 text-center">
                      <button
                        type="button"
                        disabled={!canEdit || saving === key}
                        onClick={() => toggle(m, s)}
                        className={cn(
                          'w-full rounded px-1 py-0.5 font-mono',
                          on ? 'bg-primary/15 text-primary' : 'text-muted-foreground/60 hover:bg-muted',
                          !canEdit && 'cursor-default',
                        )}
                        title={canEdit ? 'Clic: — → L–V → L–S → —' : undefined}
                      >
                        {saving === key ? '…' : daysLabel(days)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
