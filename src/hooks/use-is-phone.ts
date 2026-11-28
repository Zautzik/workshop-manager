'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 767px)';

/**
 * True below the `md` breakpoint (768 px). For choosing which component to
 * MOUNT — e.g. the phone plan instead of the Gantt — where hiding with CSS
 * would still build the heavy one. Server render assumes desktop.
 */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(QUERY);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
