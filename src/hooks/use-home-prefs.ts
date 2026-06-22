'use client';
import { useCallback, useEffect, useState } from 'react';

// Per-user home preferences (localStorage). The vital strip is off by default —
// it's an opt-in for power users via the "Personalizar" dialog.
const KEY = 'home_prefs:v1';
const EVT = 'home-prefs-changed';

interface HomePrefs {
  showVitals: boolean;
}
const DEFAULTS: HomePrefs = { showVitals: false };

function read(): HomePrefs {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function useHomePrefs() {
  const [prefs, setPrefs] = useState<HomePrefs>(DEFAULTS);

  useEffect(() => {
    const sync = () => setPrefs(read());
    sync();
    // Same-tab updates via custom event; cross-tab via storage.
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const update = useCallback((patch: Partial<HomePrefs>) => {
    const next = { ...read(), ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setPrefs(next);
    window.dispatchEvent(new Event(EVT));
  }, []);

  return {
    prefs,
    setShowVitals: (v: boolean) => update({ showVitals: v }),
  };
}
