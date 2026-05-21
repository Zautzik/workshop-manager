'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

interface BackToModuleProps {
  /** The root path of the module, e.g. '/workflow' */
  modulePath: string;
  /** Display name shown in the button, e.g. 'Operaciones' */
  moduleName: string;
}

/**
 * Renders a "← Back to [Module]" button on any sub-page within a module.
 * Does NOT render on the module's own landing page.
 */
export default function BackToModule({ modulePath, moduleName }: BackToModuleProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Hide on the module landing page itself
  if (pathname === modulePath) return null;

  return (
    <div className="fixed top-4 left-4 z-50">
      <button
        onClick={() => router.push(modulePath)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
          bg-zinc-900/80 border border-zinc-700/60 text-zinc-300
          hover:bg-zinc-800 hover:text-white hover:border-zinc-500
          backdrop-blur-sm transition-all duration-150 shadow-lg"
      >
        <ArrowLeft size={14} />
        {moduleName}
      </button>
    </div>
  );
}
