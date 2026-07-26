'use client';

/**
 * AdvanceFlags — the ONE control for an OT's checkpoint chain.
 *
 * ORD → PRO → VBP → PLN → PAP is a strict dependency chain in real plant
 * practice (no PRO without an ORD, no PAP without a VBP — owner correction,
 * 2026-07). It used to be five independent toggle pills, which meant clicking
 * every pill on every OT for no upside, since nobody sets them out of order.
 *
 * This component is the single source of truth for that chain. It was living
 * inline in OrdenesEnProceso while HojaProduccion still rendered the old
 * five-pill version and PlanSemanal a third mini variant — same concept, three
 * faces. Extracted here so every view speaks the same language.
 *
 * Variants:
 *   interactive (default) — dots + undo + green advance button. Supervisor views.
 *   readOnly              — dots only. Dense/planning views where a stray click
 *                           must never mutate production state.
 */

import {
  ArrowRight, Undo2, Check,
  FileCheck, FileImage, Signature, CalendarCheck, PackageCheck,
} from 'lucide-react';

export const FLAG_SEQUENCE = [
  { key: 'flag_ord', label: 'ORD', name: 'Orden confirmada', dot: 'bg-blue-600', icon: FileCheck },
  { key: 'flag_pro', label: 'PRO', name: 'Prueba / preprensa lista', dot: 'bg-violet-600', icon: FileImage },
  { key: 'flag_vbp', label: 'VBP', name: 'Visto Bueno del cliente', dot: 'bg-amber-500', icon: Signature },
  { key: 'flag_plan', label: 'PLN', name: 'Programada en el plan', dot: 'bg-cyan-600', icon: CalendarCheck },
  { key: 'flag_paper_arrived', label: 'PAP', name: 'Papel en bodega', dot: 'bg-emerald-600', icon: PackageCheck },
] as const;

export type OtFlagKey = (typeof FLAG_SEQUENCE)[number]['key'];

/** Where an OT sits in the chain. Exported so callers can label/sort by stage. */
export function getFlagProgress(ot: Record<string, unknown> | null | undefined) {
  const values = FLAG_SEQUENCE.map((f) => !!ot?.[f.key]);
  const firstPending = values.findIndex((v) => !v);
  const doneCount = values.filter(Boolean).length;
  return {
    values,
    firstPending,
    doneCount,
    done: firstPending === -1,
    hasProgress: doneCount > 0,
    // index of the last completed step — the one an undo would correct
    lastDone: doneCount === 0
      ? -1
      : values.length - 1 - [...values].reverse().findIndex((v) => v),
  };
}

const SIZES = {
  sm: { dot: 'h-4 w-4', icon: 'h-2.5 w-2.5', action: 'h-5 w-5', actionIcon: 'h-3 w-3', gap: 'gap-0.5' },
  md: { dot: 'h-5 w-5', icon: 'h-3 w-3', action: 'h-6 w-6', actionIcon: 'h-4 w-4', gap: 'gap-1' },
} as const;

export interface AdvanceFlagsProps {
  ot: Record<string, unknown>;
  /** Called with the next pending flag key; set it to true. */
  onAdvance?: (key: OtFlagKey) => void;
  /** Called with the last completed flag key; set it to false. */
  onUndo?: (key: OtFlagKey) => void;
  /** Dots only — no mutation affordances. */
  readOnly?: boolean;
  size?: keyof typeof SIZES;
  className?: string;
}

export function AdvanceFlags({
  ot,
  onAdvance,
  onUndo,
  readOnly = false,
  size = 'md',
  className = '',
}: AdvanceFlagsProps) {
  const { values, firstPending, lastDone, done, hasProgress } = getFlagProgress(ot);
  const s = SIZES[size];

  const summary = done
    ? 'Completo — papel en bodega, lista para producción'
    : `Siguiente paso: ${FLAG_SEQUENCE[firstPending].name}`;

  return (
    <div className={`flex items-center ${size === 'sm' ? 'gap-1' : 'gap-2'} ${className}`} title={summary}>
      {/* Progress dots — a pictogram per checkpoint, so the stage reads without
          having to memorize a color code. */}
      <div className={`flex items-center ${s.gap}`}>
        {FLAG_SEQUENCE.map((f, i) => {
          const Icon = f.icon;
          return (
            <span
              key={f.key}
              title={`${f.label} — ${f.name}${values[i] ? ' ✓' : ''}`}
              aria-label={`${f.name}: ${values[i] ? 'completado' : 'pendiente'}`}
              className={`flex ${s.dot} shrink-0 items-center justify-center rounded-full border ${
                values[i] ? `${f.dot} border-transparent` : 'bg-transparent border-border'
              }`}
            >
              <Icon className={`${s.icon} ${values[i] ? 'text-white' : 'text-muted-foreground/50'}`} />
            </span>
          );
        })}
      </div>

      {readOnly ? null : (
        <>
          {/* Undo — only appears once there's a step to correct. */}
          {hasProgress && onUndo && (
            <button
              type="button"
              onClick={() => onUndo(FLAG_SEQUENCE[lastDone].key)}
              title={`Deshacer: ${FLAG_SEQUENCE[lastDone].name}`}
              aria-label={`Deshacer ${FLAG_SEQUENCE[lastDone].name}`}
              className="text-muted-foreground/50 hover:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              <Undo2 className={s.actionIcon} />
            </button>
          )}

          {/* Advance — the one action a supervisor actually needs. */}
          {done ? (
            <span
              title="Completo"
              aria-label="Cadena completa"
              className={`flex ${s.action} shrink-0 items-center justify-center rounded-full bg-emerald-600/15 text-emerald-600`}
            >
              <Check className={s.actionIcon} />
            </span>
          ) : (
            onAdvance && (
              <button
                type="button"
                onClick={() => onAdvance(FLAG_SEQUENCE[firstPending].key)}
                title={`Avanzar a: ${FLAG_SEQUENCE[firstPending].name}`}
                aria-label={`Avanzar a ${FLAG_SEQUENCE[firstPending].name}`}
                className={`flex ${s.action} shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
              >
                <ArrowRight className={s.actionIcon} />
              </button>
            )
          )}
        </>
      )}
    </div>
  );
}

export default AdvanceFlags;
