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
  title = 'Workshop Manager',
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
          <linearGradient id="forge-bg" x1="32" y1="24" x2="224" y2="232" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0F172A" />
            <stop offset="1" stopColor="#111827" />
          </linearGradient>
          <linearGradient id="forge-accent" x1="74" y1="64" x2="182" y2="192" gradientUnits="userSpaceOnUse">
            <stop stopColor="#22D3EE" />
            <stop offset="1" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
        <rect x="16" y="16" width="224" height="224" rx="52" fill="url(#forge-bg)" />
        <path d="M128 48L185 81V147L128 180L71 147V81L128 48Z" stroke="url(#forge-accent)" strokeWidth="14" strokeLinejoin="round" />
        <path d="M83 103L104 152L128 112L152 152L173 103" stroke="#F8FAFC" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="128" cy="180" r="10" fill="#F59E0B" />
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