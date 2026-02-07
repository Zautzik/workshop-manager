/**
 * @fileoverview Mobile Responsive Detection Hook
 * 
 * SYSTEM ROLE: Responsive Design Detection
 * ORGAN ANALOGY: The "Weather Sensor" - Detects viewport size for responsive behavior
 * 
 * Custom hook that detects if device is mobile (viewport < 768px):
 * 
 * - Uses window.matchMedia API for efficient viewport detection
 * - Listens to window resize events for dynamic updates
 * - Returns boolean: true if mobile, false if desktop/tablet
 * 
 * Breakpoint: 768px (Tailwind's 'md' breakpoint)
 * 
 * Usage:
 *   const isMobile = useIsMobile();
 *   return <div>{isMobile ? <MobileMenu /> : <DesktopMenu />}</div>
 * 
 * Used to show/hide components and adjust layouts for different screen sizes.
 */
'use client';
import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
