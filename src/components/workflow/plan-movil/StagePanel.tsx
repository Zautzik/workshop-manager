'use client';

/**
 * One stage of the plan, and what can be done to it from a phone — the same
 * things the Gantt does by dragging:
 *   - Mover a…:  machine + time → preview with landingSlot → pin (usePlanActions)
 *   - Liberar:   remove the pin; the scheduler places it again
 *   - Simular atraso: +N h on this stage → which deliveries move (no write)
 *   - Ajuste:    the job's make-ready per pass, on offset presses
 * Edit actions only for admin / supervisor, as on the Gantt.
 */

import { useMemo, useState } from 'react';
import { Pin, Unlock, Timer, Wrench } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePlanActions } from '@/hooks/use-plan-actions';
import { landingSlot } from '@/lib/plan-actions';
import { plantParts, plantWallClockToMs } from '@/lib/plant-calendar';
import { formatPlantDay, formatPlantRange, formatSpan, type PlanInput } from '@/lib/production-plan';
import { PLAN_STEP_BY_KEY } from '@/lib/production-route';
import { buildSchedule, compareSchedules, lanesForStep, type Block, type Schedule } from '@/lib/production-scheduler';

const pad = (n: number) => String(n).padStart(2, '0');
/** ms → "YYYY-MM-DDTHH:MM" in plant time, for <input type="datetime-local">. */
function toInput(ms: number): string {
  const p = plantParts(ms);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
function fromInput(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  return m ? plantWallClockToMs(+m[1], +m[2], +m[3], +m[4] * 60 + +m[5]) : null;
}

export function StagePanel({
  block, schedule, plan, planNow, otLabel, canEdit, onClose,
}: {
  block: Block;
  schedule: Schedule;
  plan: PlanInput;
  planNow: number;
  otLabel: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const actions = usePlanActions();
  const lane = schedule.lanes.find((l) => l.id === block.laneId)!;
  const options = useMemo(() => lanesForStep(schedule.lanes, block.step).filter((l) => !l.virtual), [schedule, block.step]);
  const ot = plan.ots.find((o) => o.id === block.otId) as any;

  const [laneId, setLaneId] = useState(options.some((l) => l.id === lane.id) ? lane.id : options[0]?.id ?? '');
  const [when, setWhen] = useState(toInput(block.start));
  const [busy, setBusy] = useState(false);
  const [delay, setDelay] = useState(0);
  const [ajuste, setAjuste] = useState<string>(ot?.ajuste_minutes != null ? String(ot.ajuste_minutes) : '');

  const toLane = options.find((l) => l.id === laneId) ?? null;
  const wanted = fromInput(when);
  const preview = toLane && wanted != null
    ? landingSlot({ block, fromLane: lane, toLane, wantedStart: wanted, now: planNow, otAjusteMinutes: ot?.ajuste_minutes })
    : null;

  // Delay simulation: the same scheduler with +N h on this stage.
  const impacts = useMemo(() => {
    if (delay <= 0) return [];
    const sim = buildSchedule({ now: planNow, ots: plan.ots, machines: plan.machines, pins: plan.pins, maintenance: plan.maintenance, delays: { [block.id]: delay } });
    return compareSchedules(schedule, sim);
  }, [delay, block.id, plan, planNow, schedule]);
  const numberOf = (otId: string) => String((plan.ots.find((o) => o.id === otId) as any)?.ot_number ?? otId).replace(/^OT-?/i, '');

  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-left text-base">{otLabel}</DialogTitle>
          <p className="text-left text-sm text-muted-foreground">
            {PLAN_STEP_BY_KEY[block.step]?.label} · {lane.name}
            <br />
            {formatPlantRange(block.start, block.end)}
            {block.pinned && <span className="ml-1 inline-flex items-center gap-0.5 text-primary"><Pin className="h-3 w-3" /> fijada</span>}
          </p>
          {block.conflict && <p className="text-left text-xs text-destructive">{block.conflict}</p>}
          {block.note && <p className="text-left text-xs text-muted-foreground">{block.note}</p>}
        </DialogHeader>

        {canEdit ? (
          <section className="space-y-2 rounded-lg border p-3">
            <h3 className="text-sm font-semibold">Mover a…</h3>
            <label className="block text-xs text-muted-foreground">
              Máquina
              <select value={laneId} onChange={(e) => setLaneId(e.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm">
                {options.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label className="block text-xs text-muted-foreground">
              Desde
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="mt-1 h-10" />
            </label>
            {preview && toLane && (
              <p className="text-xs">Quedaría en <b>{toLane.name}</b>, {formatPlantRange(preview.start, preview.end)}</p>
            )}
            <Button className="h-10 w-full" disabled={!preview || !toLane || busy} onClick={() => preview && toLane && run(() => actions.pin(block, toLane, preview.start, preview.end, otLabel))}>
              <Pin className="mr-1.5 h-4 w-4" /> Fijar aquí
            </Button>
            {block.pinned && (
              <Button variant="outline" className="h-10 w-full" disabled={busy} onClick={() => run(() => actions.release(block))}>
                <Unlock className="mr-1.5 h-4 w-4" /> Liberar (que el programa la ubique)
              </Button>
            )}
          </section>
        ) : (
          <p className="text-xs text-muted-foreground">Mover etapas lo hacen administración y supervisión.</p>
        )}

        <section className="space-y-2 rounded-lg border p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Timer className="h-4 w-4" /> Simular atraso</h3>
          <div className="flex gap-2">
            {[1, 4, 8].map((h) => (
              <Button key={h} variant={delay === h ? 'default' : 'outline'} className="h-10 flex-1" onClick={() => setDelay(delay === h ? 0 : h)}>
                +{h} h
              </Button>
            ))}
          </div>
          {delay > 0 && (
            impacts.length === 0 ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-400">No mueve ninguna entrega.</p>
            ) : (
              <ul className="space-y-0.5 text-xs">
                {impacts.slice(0, 8).map((i) => (
                  <li key={i.otId} className={i.becomesLate ? 'font-semibold text-red-600' : ''}>
                    {numberOf(i.otId)}: se corre {formatSpan(i.shiftHours)}{i.becomesLate ? ' — pasa a estar atrasada' : ''}
                  </li>
                ))}
                {impacts.length > 8 && <li className="text-muted-foreground">y {impacts.length - 8} más</li>}
              </ul>
            )
          )}
          <p className="text-xs text-muted-foreground">Sólo simula: no cambia el programa.</p>
        </section>

        {canEdit && lane.type === 'offset_printer' && (
          <section className="space-y-2 rounded-lg border p-3">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Wrench className="h-4 w-4" /> Ajuste de este trabajo</h3>
            <div className="flex gap-2">
              <Input type="number" min={0} inputMode="numeric" placeholder="min por pasada (vacío = el de la prensa)" value={ajuste} onChange={(e) => setAjuste(e.target.value)} className="h-10" />
              <Button className="h-10" disabled={busy} onClick={() => run(() => actions.saveAjuste(block.otId, ajuste.trim() === '' ? null : Math.max(0, Number(ajuste))))}>
                Guardar
              </Button>
            </div>
          </section>
        )}

        <p className="text-xs text-muted-foreground">Entrega: {ot?.deadline ? formatPlantDay(Date.parse(ot.deadline)) : 'sin plazo'}</p>
      </DialogContent>
    </Dialog>
  );
}
