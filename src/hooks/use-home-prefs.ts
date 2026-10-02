'use client';
import { useCallback, useEffect, useState } from 'react';

// Per-user home preferences (localStorage). El strip de vitales por defecto
// sigue el rol: encendido para quien gestiona (admin/manager), apagado para
// quien opera una estación — nadie pierde su elección explícita, esto sólo
// decide qué ve alguien que nunca tocó "Personalizar inicio" (auditoría
// 2026-10-02, antes era `false` para todos sin excepción).
const KEY = 'home_prefs:v1';
const EVT = 'home-prefs-changed';
const VITALS_DEFAULT_ON_ROLES = new Set(['admin', 'manager']);

interface HomePrefs {
  showVitals: boolean;
}

function defaultsFor(role?: string | null): HomePrefs {
  return { showVitals: !!role && VITALS_DEFAULT_ON_ROLES.has(role) };
}

function read(role?: string | null): HomePrefs {
  const defaults = defaultsFor(role);
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

export function useHomePrefs(role?: string | null) {
  const [prefs, setPrefs] = useState<HomePrefs>(() => defaultsFor(role));

  useEffect(() => {
    const sync = () => setPrefs(read(role));
    sync();
    // Same-tab updates via custom event; cross-tab via storage.
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [role]);

  const update = useCallback((patch: Partial<HomePrefs>) => {
    const next = { ...read(role), ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setPrefs(next);
    window.dispatchEvent(new Event(EVT));
  }, [role]);

  return {
    prefs,
    setShowVitals: (v: boolean) => update({ showVitals: v }),
  };
}
