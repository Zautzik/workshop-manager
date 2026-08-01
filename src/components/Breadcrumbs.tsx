'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HOME_ITEM } from '@/lib/navigation';
import { buildCrumbs } from '@/lib/breadcrumbs';
import { useAuth } from '@/contexts/AuthContext';

/**
 * "Inicio › Personas › Consola Operativa" — where you are and how you got
 * there. Rendered by AppShell in the header, so it appears on every page
 * inside the shell without pages having to opt in.
 */
export default function Breadcrumbs({ className }: { className?: string }) {
  const pathname = usePathname();
  const { role } = useAuth();

  const canSeeHome = (HOME_ITEM.roles as string[]).includes(role || '');
  const crumbs = buildCrumbs(pathname, canSeeHome);

  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Ruta de navegación"
      className={cn('flex min-w-0 items-center text-sm', className)}
    >
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        // Narrow screens keep only the current page and its parent; the header
        // actions matter more there than the full trail.
        const hiddenOnMobile = i < crumbs.length - 2;
        const isFirstOnMobile = i === crumbs.length - 2;

        return (
          <div
            key={crumb.href ?? crumb.label}
            className={cn(
              'flex min-w-0 items-center',
              hiddenOnMobile ? 'hidden md:flex' : 'flex'
            )}
          >
            {i > 0 && (
              <ChevronRight
                className={cn(
                  'mx-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40',
                  isFirstOnMobile && 'hidden md:block'
                )}
              />
            )}
            {crumb.href && !isLast ? (
              <Link
                href={crumb.href}
                className="flex items-center gap-1.5 truncate rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {i === 0 && crumb.href === HOME_ITEM.href && (
                  <Home className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="truncate">{crumb.label}</span>
              </Link>
            ) : (
              <span
                aria-current="page"
                className="truncate px-1.5 py-1 font-semibold text-foreground"
              >
                {crumb.label}
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
