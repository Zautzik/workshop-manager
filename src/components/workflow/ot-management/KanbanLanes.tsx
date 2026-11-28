'use client';

/**
 * Tablero › Carriles (audit M2) — the default view.
 *
 * The hex board draws each phase as a hexagon with scroll areas nested inside
 * it; cards got clipped and it stops working past ~40 open OTs. Here each
 * phase is a lane, each stage inside it a drop target, each OT one compact
 * row — readable at 200 OTs and on a phone.
 *
 * Same phases (KANBAN_GROUPS), same drop handlers and callbacks as the hex
 * board: moving a card goes through exactly the same path (requestAdvance /
 * rollback → moveOT on the server). Only the drawing changed.
 */

import { CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCalendarDate } from '@/lib/format';
import { otStatusLabel } from '@/lib/status-labels';
import { KANBAN_GROUPS, getStatusInfo } from './kanban-constants';

interface Props {
  getByStatus: (key: string) => any[];
  dragOverCol: string | null;
  draggingId: string | null;
  openPasses: Record<string, string[]>;
  splitGroupTotals: Record<string, number>;
  onDragStart: (e: React.DragEvent, ot: any) => void;
  onDragEnd: () => void;
  onColEnter: (e: React.DragEvent, key: string) => void;
  onColLeave: (e: React.DragEvent, key: string) => void;
  onColOver: (e: React.DragEvent) => void;
  onColDrop: (e: React.DragEvent, key: string) => void;
  onOTSelect: (ot: any) => void;
  onPasadasOpen: (ot: any) => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

function OTRow({ ot, rgb, props }: { ot: any; rgb: string; props: Props }) {
  const { draggingId, openPasses, splitGroupTotals, onDragStart, onDragEnd, onOTSelect, onPasadasOpen } = props;
  const isPartial = !!ot.is_partial;
  const splitTotal = ot.split_group_id ? Number(splitGroupTotals[ot.split_group_id] ?? 0) : 0;
  const splitPct = isPartial && splitTotal > 0 ? Math.max(1, Math.min(100, Math.round((Number(ot.quantity ?? 0) / splitTotal) * 100))) : null;
  const debe: string[] = openPasses[ot.id] ?? [];
  const late = !!ot.deadline && String(ot.deadline).slice(0, 10) < todayIso() && ot.status !== 'completed';
  const pri = ot.priority >= 8 ? 'bg-red-500' : ot.priority >= 5 ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600';

  return (
    <li
      draggable
      onDragStart={(e) => onDragStart(e, ot)}
      onDragEnd={onDragEnd}
      onClick={() => { if (draggingId !== ot.id) onOTSelect(ot); }}
      className={cn(
        'group flex min-h-[44px] cursor-grab items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm shadow-sm transition-colors hover:bg-muted/60',
        draggingId === ot.id && 'opacity-30',
        isPartial && 'border-dashed',
      )}
      style={{ borderLeft: `3px solid rgb(${rgb})` }}
      title={`${ot.ot_number} · ${ot.client_name ?? ''}`}
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', pri)} aria-label={`Prioridad ${ot.priority ?? '—'}`} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-semibold">{String(ot.ot_number).replace(/^OT-?/i, '')}</span>
          {splitPct !== null && <span className="text-xs font-semibold text-amber-600">{splitPct}%</span>}
          {ot.deadline && (
            <span className={cn('ml-auto shrink-0 text-xs tabular-nums', late ? 'font-semibold text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
              {formatCalendarDate(ot.deadline, { withYear: false })}
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{ot.client_name ?? '—'}</span>
      </span>
      {debe.length > 0 && (
        // The pending-hours marker, and the door to close them — same as on the hex board.
        <button
          type="button"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); onPasadasOpen(ot); }}
          className="shrink-0 rounded p-2 text-amber-600 hover:bg-amber-500/10 sm:p-1"
          title={`Faltan horas de: ${debe.map(otStatusLabel).join(', ')}`}
          aria-label={`Cerrar pasadas pendientes de ${ot.ot_number}`}
        >
          <CircleDot className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

export function KanbanLanes(props: Props) {
  const { getByStatus, dragOverCol, draggingId, onColEnter, onColLeave, onColOver, onColDrop } = props;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 2xl:grid-cols-6">
      {KANBAN_GROUPS.map((group) => {
        const stages = group.stages as readonly string[];
        const count = stages.reduce((s, k) => s + getByStatus(k).length, 0);
        return (
          <details key={group.id} open={count > 0} className="group/lane flex min-w-0 flex-col rounded-xl border bg-card/60 md:[&:not([open])]:opacity-100" >
            <summary
              className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-t-xl px-3 py-2 md:cursor-default"
              style={{ borderBottom: `3px solid rgb(${group.rgb})` }}
            >
              <span className="truncate text-sm font-bold" style={{ color: `rgb(${group.rgb})` }}>{group.label}</span>
              <span className="shrink-0 rounded-full px-2 text-xs font-semibold tabular-nums" style={{ background: `rgb(${group.rgb} / 0.15)`, color: `rgb(${group.rgb})` }}>
                {count}
              </span>
            </summary>
            <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-2">
              {stages.map((stageKey) => {
                const ots = getByStatus(stageKey);
                const isOver = dragOverCol === stageKey && !!draggingId;
                return (
                  <section
                    key={stageKey}
                    onDragEnter={(e) => onColEnter(e, stageKey)}
                    onDragLeave={(e) => onColLeave(e, stageKey)}
                    onDragOver={onColOver}
                    onDrop={(e) => onColDrop(e, stageKey)}
                    className={cn('rounded-lg p-1.5 transition-colors', isOver ? 'bg-primary/10 ring-1 ring-primary/40' : 'bg-muted/30')}
                  >
                    <h4 className="mb-1 flex items-center justify-between px-1 text-xs font-semibold text-muted-foreground">
                      <span className="truncate">{getStatusInfo(stageKey).labelEs}</span>
                      <span className="tabular-nums">{ots.length}</span>
                    </h4>
                    {ots.length === 0 ? (
                      <p className={cn('px-1 py-1 text-xs', isOver ? 'text-primary' : 'text-muted-foreground/60')}>{isOver ? 'Soltar aquí' : '—'}</p>
                    ) : (
                      <ul className="space-y-1">
                        {ots.map((ot) => <OTRow key={ot.id} ot={ot} rgb={group.rgb} props={props} />)}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}
