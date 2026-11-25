import { cn } from '@/lib/utils';

/**
 * The one page frame (plan 2026-11-25, F1).
 *
 * Before this, each of the 76 pages picked its own padding (`p-6`,
 * `p-6 md:p-8`, `p-4 md:p-6`, …) and its own heading size, so a phone lost
 * 48 px of a 390 px screen to padding alone and no two pages lined up.
 *
 * Width is NOT decided here: the shell caps every page at `CONTENT_MAX`
 * (AppShell), and wide boards opt out there by route — so a page that renders
 * a component directly gets the same cap without having to remember it.
 *
 * Padding is `px-4` on a phone, `px-6` from `sm`, `px-8` from `lg`. The
 * vertical rhythm is `space-y-5`, `space-y-6` from `sm`. `AnalyticsFilterBar`
 * bleeds to the edges with matching negative margins (`PAGE_BLEED`), so the
 * two must change together.
 */
export const PAGE_PADDING = 'px-4 py-5 sm:px-6 sm:py-6 lg:px-8';
/** Negative margins that cancel PAGE_PADDING's horizontal padding (full-bleed bars). */
export const PAGE_BLEED = '-mx-4 sm:-mx-6 lg:-mx-8';

interface PageShellProps {
  children: React.ReactNode;
  className?: string;
  /** Page heading. Omit when the page draws its own header. */
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Buttons for the header's right side. They wrap under the title on a phone. */
  actions?: React.ReactNode;
  /** Icon shown before the title. */
  icon?: React.ReactNode;
}

export function PageShell({ children, className, title, subtitle, actions, icon }: PageShellProps) {
  return (
    <div className={cn('w-full min-w-0 space-y-5 sm:space-y-6', PAGE_PADDING, className)}>
      {(title || actions) && <PageHeader title={title} subtitle={subtitle} actions={actions} icon={icon} />}
      {children}
    </div>
  );
}

/** The header row on its own, for pages whose frame is not a PageShell. */
export function PageHeader({ title, subtitle, actions, icon }: Omit<PageShellProps, 'children' | 'className'>) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        {title && (
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {icon}
            {title}
          </h1>
        )}
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
