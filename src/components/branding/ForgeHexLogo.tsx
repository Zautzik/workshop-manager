'use client';

import { cn } from '@/lib/utils';

interface ForgeHexLogoProps {
  className?: string;
  size?: number;
  showWordmark?: boolean;
  title?: string;
  subtitle?: string;
  titleClassName?: string;
  subtitleClassName?: string;
}

/**
 * Primary product brand mark used across the application shell, auth screens,
 * and admin surfaces. The symbol is optimized to remain legible at favicon,
 * sidebar, and header sizes while the wordmark preserves a premium UI feel.
 */
export function ForgeHexLogo({
  className,
  size = 40,
  showWordmark = true,
  title = 'GonsAdmin',
  subtitle,
  titleClassName,
  subtitleClassName,
}: ForgeHexLogoProps) {
  return (
    <div className={cn('flex items-center gap-3 min-w-0', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 256 256"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
        role="img"
        aria-label={`${title} logo`}
      >
        <defs>
          <linearGradient id="ga-bg" x1="0" y1="0" x2="256" y2="256" gradientUnits="userSpaceOnUse">
            <stop stopColor="#080D1A" />
            <stop offset="1" stopColor="#0F1520" />
          </linearGradient>
          <linearGradient id="ga-mark" x1="28" y1="28" x2="228" y2="228" gradientUnits="userSpaceOnUse">
            <stop stopColor="#22D3EE" />
            <stop offset="0.55" stopColor="#818CF8" />
            <stop offset="1" stopColor="#6366F1" />
          </linearGradient>
          <linearGradient id="ga-border" x1="0" y1="0" x2="256" y2="256" gradientUnits="userSpaceOnUse">
            <stop stopColor="#22D3EE" stopOpacity="0.35" />
            <stop offset="1" stopColor="#6366F1" stopOpacity="0.15" />
          </linearGradient>
        </defs>

        {/* Background */}
        <rect width="256" height="256" rx="56" fill="url(#ga-bg)" />
        {/* Subtle gradient border ring */}
        <rect x="1.5" y="1.5" width="253" height="253" rx="55" stroke="url(#ga-border)" strokeWidth="2" />

        {/* G lettermark — geometric bold sans */}
        {/* Top bar */}
        <rect x="28" y="28"  width="200" height="30" rx="3" fill="url(#ga-mark)" />
        {/* Left bar */}
        <rect x="28" y="28"  width="30"  height="200" rx="3" fill="url(#ga-mark)" />
        {/* Bottom bar */}
        <rect x="28" y="198" width="200" height="30"  rx="3" fill="url(#ga-mark)" />
        {/* Crossbar — starts 20 px inset from inner left wall, leaving the G open */}
        <rect x="78" y="113" width="150" height="30"  rx="3" fill="url(#ga-mark)" />
        {/* Right bar — lower half only, defining the G opening */}
        <rect x="198" y="113" width="30" height="115" rx="3" fill="url(#ga-mark)" />
      </svg>

      {showWordmark && (
        <div className="min-w-0 overflow-hidden">
          <div className={cn('text-sm font-semibold text-foreground truncate', titleClassName)}>{title}</div>
          {subtitle && (
            <div className={cn('text-[10px] text-muted-foreground truncate', subtitleClassName)}>{subtitle}</div>
          )}
        </div>
      )}
    </div>
  );
}