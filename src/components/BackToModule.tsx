'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

interface BackToModuleProps {
  /** The root path of the module, e.g. '/operaciones' */
  modulePath: string;
  /** Display name shown in the link, e.g. 'Operaciones' */
  moduleName: string;
}

/**
 * Breadcrumb back to a module, rendered on that module's sub-pages.
 *
 * Deliberately the same shape as the `‹ Inicio` link the module landing pages
 * render, so section → module reads exactly like module → home.
 *
 * It was previously a `fixed top-4 left-4 z-50` pill in hardcoded zinc: pinned
 * to the viewport rather than the page, so it sat on top of the sidebar rail and
 * over each page's own title, and it stayed dark on the light theme because the
 * colours were literals instead of tokens. A Link also restores prefetch,
 * middle-click and open-in-new-tab, which `router.push` in a button had removed.
 */
export default function BackToModule({ modulePath, moduleName }: BackToModuleProps) {
  const pathname = usePathname();

  // Nothing to go back to from the module's own landing page.
  if (pathname === modulePath) return null;

  return (
    <div className="px-6 pt-5">
      <Link
        href={modulePath}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {moduleName}
      </Link>
    </div>
  );
}
