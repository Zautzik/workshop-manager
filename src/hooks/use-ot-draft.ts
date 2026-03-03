'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { OTFormData } from '@/types/ot';
import { INITIAL_OT_FORM } from '@/types/ot';

const DRAFT_STORAGE_KEY = 'ot_wizard_draft';
const AUTO_SAVE_INTERVAL = 10_000; // 10 seconds

interface DraftState {
  form: OTFormData;
  step: number;
  updatedAt: string;
  draftId?: string;
}

/**
 * Hook that provides auto-save to localStorage + server-side draft persistence.
 */
export function useOTDraftAutoSave(
  form: OTFormData,
  step: number,
  enabled: boolean = true
) {
  const [draftId, setDraftId] = useState<string | undefined>();
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const formRef = useRef(form);
  const stepRef = useRef(step);

  // Keep refs current
  formRef.current = form;
  stepRef.current = step;

  // Mark dirty on any form change
  useEffect(() => {
    setIsDirty(true);
  }, [form, step]);

  // Save to localStorage
  const saveToLocal = useCallback(() => {
    if (!enabled) return;
    const draft: DraftState = {
      form: {
        ...formRef.current,
        attachments: [], // Don't serialize File objects
      },
      step: stepRef.current,
      updatedAt: new Date().toISOString(),
      draftId,
    };
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      setLastSaved(new Date());
      setIsDirty(false);
    } catch {
      // storage full or unavailable
    }
  }, [enabled, draftId]);

  // Save to server
  const saveToServer = useCallback(async () => {
    if (!enabled) return;
    try {
      const payload = {
        draft_id: draftId,
        form_data: {
          ...formRef.current,
          attachments: [], // Don't serialize File objects
        },
        step: stepRef.current,
      };
      const res = await fetch('/api/ot-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.id && !draftId) {
          setDraftId(data.id);
        }
        setLastSaved(new Date());
        setIsDirty(false);
      }
    } catch {
      // server save failed — local copy is the fallback
    }
  }, [enabled, draftId]);

  // Auto-save to localStorage periodically
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      if (isDirty) saveToLocal();
    }, AUTO_SAVE_INTERVAL);
    return () => clearInterval(timer);
  }, [enabled, isDirty, saveToLocal]);

  // Load from localStorage on mount
  const loadFromLocal = useCallback((): DraftState | null => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return null;
      const draft: DraftState = JSON.parse(raw);
      if (draft.draftId) setDraftId(draft.draftId);
      return draft;
    } catch {
      return null;
    }
  }, []);

  // Clear draft
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // ignore
    }
    if (draftId) {
      fetch(`/api/ot-drafts/${draftId}`, { method: 'DELETE' }).catch(() => {});
    }
    setDraftId(undefined);
    setLastSaved(null);
    setIsDirty(false);
  }, [draftId]);

  return {
    draftId,
    lastSaved,
    isDirty,
    saveToLocal,
    saveToServer,
    loadFromLocal,
    clearDraft,
  };
}

/**
 * Check if there's a saved draft in localStorage.
 */
export function hasSavedDraft(): boolean {
  try {
    return !!localStorage.getItem(DRAFT_STORAGE_KEY);
  } catch {
    return false;
  }
}
