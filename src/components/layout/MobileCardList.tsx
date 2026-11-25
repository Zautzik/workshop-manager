import { cn } from '@/lib/utils';

/**
 * The phone form of a table (plan 2026-11-25, F3).
 *
 * A table with 6–8 columns cannot be read at 390 px: it either pushes the page
 * sideways or hides behind a horizontal scroll where only the first column is
 * ever seen. Below `md` a table renders as this list instead — one row per
 * record, the name first, two or three facts under it, actions at the end —
 * and from `md` up the same page shows its normal table.
 *
 * Usage:
 *   <div className="hidden md:block"><Table>…</Table></div>
 *   <MobileCardList>
 *     {rows.map((r) => <MobileCard key={r.id} title={r.name} meta={[r.rut, r.city]} actions={…} />)}
 *   </MobileCardList>
 */
export function MobileCardList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn('divide-y divide-border/60 md:hidden', className)}>{children}</ul>;
}

interface MobileCardProps {
  title: React.ReactNode;
  /** Short facts shown under the title; empty values are skipped. */
  meta?: React.ReactNode[];
  /** Leading icon or avatar. */
  leading?: React.ReactNode;
  /** A badge or status next to the title. */
  badge?: React.ReactNode;
  /** Buttons at the end of the row. Give them at least h-9 so they can be tapped. */
  actions?: React.ReactNode;
  /** Whole-row tap target (opens the record). */
  onClick?: () => void;
  muted?: boolean;
}

export function MobileCard({ title, meta = [], leading, badge, actions, onClick, muted }: MobileCardProps) {
  const facts = meta.filter((m) => m !== null && m !== undefined && m !== '' && m !== false);
  return (
    <li className={cn('flex items-center gap-3 px-3 py-3', muted && 'opacity-60')}>
      {leading && <span className="shrink-0 text-muted-foreground">{leading}</span>}
      <div
        className={cn('min-w-0 flex-1', onClick && 'cursor-pointer')}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{title}</span>
          {badge}
        </div>
        {facts.length > 0 && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {facts.map((f, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-1.5 text-border">·</span>}
                {f}
              </span>
            ))}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </li>
  );
}
