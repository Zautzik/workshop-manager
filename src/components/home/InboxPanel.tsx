'use client';

/**
 * Inicio › "Para hoy" — the role's inbox (audit M1). Counts come from
 * GET /api/inbox; each row links to the screen that owns the work.
 * Items with nothing pending are hidden; if everything is clear, it says so.
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronRight, CircleAlert, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InboxItem {
  key: string;
  href: string;
  tone: 'critical' | 'warning' | 'info';
  count: number | null;
  label: string;
  sample?: string[];
  error?: boolean;
}

const TONE = {
  critical: { icon: CircleAlert, cls: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' },
  warning: { icon: AlertTriangle, cls: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  info: { icon: Info, cls: 'text-sky-600 dark:text-sky-400', dot: 'bg-sky-500' },
} as const;

export function InboxPanel() {
  const { data, isLoading } = useQuery<{ items: InboxItem[] }>({
    queryKey: ['inbox'],
    queryFn: async () => {
      const res = await fetch('/api/inbox', { credentials: 'include' });
      if (!res.ok) throw new Error(`inbox ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  if (isLoading) return <div className="h-24 w-full max-w-xl animate-pulse rounded-2xl bg-card/60" />;
  const items = (data?.items ?? []).filter((i) => i.error || (i.count ?? 0) > 0);
  if (!data || data.items.length === 0) return null; // a role with no inbox items

  return (
    <section aria-label="Para hoy" className="w-full max-w-xl rounded-2xl border border-border/60 bg-card/80 p-3 shadow-sm backdrop-blur-sm sm:p-4">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Para hoy</h2>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 px-1 py-1 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Todo al día: nada pendiente.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {items.map((i) => {
            const t = TONE[i.tone];
            const Icon = t.icon;
            return (
              <li key={i.key}>
                <Link href={i.href} className="flex min-h-[48px] items-center gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-muted/50">
                  <Icon className={cn('h-4 w-4 shrink-0', t.cls)} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-foreground">
                      {i.error ? (
                        <span className="text-muted-foreground">No se pudo contar: {i.label}</span>
                      ) : (
                        <>
                          <span className={cn('font-bold tabular-nums', t.cls)}>{i.count}</span> {i.label}
                        </>
                      )}
                    </span>
                    {i.sample && i.sample.length > 0 && (
                      <span className="block truncate text-xs text-muted-foreground">{i.sample.join(' · ')}</span>
                    )}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
