'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { findNavTrail, landingRouteForRole } from '@/lib/navigation';
import type { AppRole } from '@/types/app-role';

interface Crumb {
  label: string;
  href: string;
}

/** A segment with no nav entry: an id reads as "Detalle", anything else is humanised. */
function labelForSegment(segment: string): string {
  const decoded = decodeURIComponent(segment);
  const looksLikeId = /^\d+$/.test(decoded) || /^[0-9a-f-]{16,}$/i.test(decoded);
  if (looksLikeId) return 'Detalle';
  const words = decoded.replace(/[-_]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Full location trail — Inicio › Módulo › Sección — derived from the
 * pathname against the nav source of truth, so it can never drift from the
 * sidebar.
 *
 * This replaces the single `‹ Módulo` back link the sub-pages used to carry.
 * That link said where you would land, not where you were: from a section three
 * levels deep it still only offered one hop, and it never named the current
 * page. Every step is a place you can go — the nav group the section belongs to
 * is left out, since it is a heading on the module landing and not a route.
 *
 * Renders nothing outside the modules (the Living Home, login, fullscreen kiosk
 * routes) — there is no trail to show at the root.
 */
export default function Breadcrumbs({ className }: { className?: string }) {
  const pathname = usePathname();
  const { role } = useAuth();
  const trail = findNavTrail(pathname);

  if (!trail) return null;

  const { module: mod, leaf, rest } = trail;
  const home = landingRouteForRole(role as AppRole | null);

  const crumbs: Crumb[] = [];
  // A vendedor's home *is* Comercial, so the root crumb would repeat the module.
  if (home !== mod.href) crumbs.push({ label: 'Inicio', href: home });
  crumbs.push({ label: mod.label, href: mod.href });
  if (leaf) crumbs.push({ label: leaf.label, href: leaf.href });
  for (const [i, segment] of rest.entries()) {
    const base = leaf?.href ?? mod.href;
    crumbs.push({
      label: labelForSegment(segment),
      href: `${base}/${rest.slice(0, i + 1).join('/')}`,
    });
  }

  // The page you are on is a label, not a link — and the trail is pointless if
  // that is all there is.
  const lastIndex = crumbs.length - 1;
  if (crumbs.length < 2) return null;

  return (
    <nav
      aria-label="Ruta de navegación"
      // Wraps rather than truncates: on a phone a deep trail costs a second line,
      // which is cheaper than hiding the ancestor you came here to click.
      className={cn('flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm text-muted-foreground', className)}
    >
      {crumbs.map((crumb, i) => {
        const isLast = i === lastIndex;
        return (
          <span key={`${crumb.label}-${i}`} className="inline-flex items-center gap-x-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />}
            {isLast ? (
              <span className="font-medium text-foreground" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <Link href={crumb.href} className="transition-colors hover:text-foreground">
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/**
 * The trail as a module layout renders it, above every sub-page of that module.
 *
 * It stands down on the module's own landing page: that page draws the trail
 * itself (ModuleHexLanding), inside the watercolor backdrop it owns, so a copy
 * here would both duplicate it and sit on the wrong background.
 *
 * The right padding keeps a long trail from running under the top bar's floating
 * search/notification cluster, which shares this band from md up.
 */
export function ModuleBreadcrumbs() {
  const pathname = usePathname();
  const trail = findNavTrail(pathname);

  if (!trail || pathname === trail.module.href) return null;

  return <Breadcrumbs className="px-6 pt-5 md:pr-36 print:hidden" />;
}
