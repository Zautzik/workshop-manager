'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getAllNavLeaves, findNavLeaf, type FlatNavLeaf } from '@/lib/navigation';
import type { AppRole } from '@/types/app-role';

// Sensible first-run shortcuts; filtered to what the role can actually open.
const DEFAULT_LINKS = [
  '/operaciones/kanban',
  '/analitica/dashboard',
  '/analitica/rentabilidad',
  '/equipos/maquinas',
  '/personas/empleados',
];

const storageKey = (userId?: string) => `quicklinks:v1:${userId ?? 'anon'}`;

/**
 * Per-user, locally-persisted home shortcuts. Stored in localStorage keyed by
 * user id so each person keeps their own set on this device. Resolves stored
 * hrefs back to live nav leaves (so labels/icons never go stale) and exposes the
 * full accessible catalogue for the picker.
 */
export function useQuickLinks() {
  const { user, role } = useAuth();
  const [hrefs, setHrefs] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  const available = useMemo(() => getAllNavLeaves(role as AppRole), [role]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = storageKey(user?.id);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHrefs(parsed.filter((h) => typeof h === 'string'));
      } else {
        const accessible = new Set(available.map((l) => l.href));
        setHrefs(DEFAULT_LINKS.filter((h) => accessible.has(h)));
      }
    } catch {
      /* corrupt value — start empty */
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, role]);

  const persist = useCallback((next: string[]) => {
    setHrefs(next);
    try {
      localStorage.setItem(storageKey(user?.id), JSON.stringify(next));
    } catch {
      /* storage unavailable — keep in-memory */
    }
  }, [user?.id]);

  const toggle = useCallback((href: string) => {
    persist(hrefs.includes(href) ? hrefs.filter((h) => h !== href) : [...hrefs, href]);
  }, [hrefs, persist]);

  const remove = useCallback((href: string) => {
    persist(hrefs.filter((h) => h !== href));
  }, [hrefs, persist]);

  const isPinned = useCallback((href: string) => hrefs.includes(href), [hrefs]);

  // Resolve pinned hrefs → live leaves, preserving the user's order, dropping
  // any that no longer exist or the role can't reach.
  const accessibleHrefs = useMemo(() => new Set(available.map((l) => l.href)), [available]);
  const links = useMemo<FlatNavLeaf[]>(
    () =>
      hrefs
        .filter((h) => accessibleHrefs.has(h))
        .map((h) => findNavLeaf(h))
        .filter((l): l is FlatNavLeaf => Boolean(l)),
    [hrefs, accessibleHrefs]
  );

  return { loaded, links, available, isPinned, toggle, remove };
}
