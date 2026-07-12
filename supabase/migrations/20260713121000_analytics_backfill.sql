-- ============================================================
-- P3.2 + P3.6 (demo-readiness plan §Phase 3) — light up cycle analytics
--
-- 81 seeded OTs are 'completed' but were seeded by setting the status
-- directly: no completed_at, no ot_status_history. Result (2026-07 audit):
-- cycle-analytics reports zero completions, no lead times, no bottlenecks —
-- the most sellable screen renders empty despite months of "history".
--
-- 1) Trigger: completed_at follows status at the DB level, so direct SQL
--    writes can never desync analytics again (the API routes already stamp
--    it; this is the belt-and-braces).
-- 2) Backfill completed_at from updated_at for legacy completed rows.
-- 3) Synthetic status history for completed OTs that have none: a canonical
--    12-step path interpolated between created_at and completed_at, with
--    deterministic per-OT jitter so stage durations vary realistically.
--    Rows are marked metadata.backfill=true and reason explains itself —
--    an auditor can always tell synthetic history from captured history.
-- ============================================================

-- ── 1. Belt-and-braces trigger ───────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_ot_completed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  ELSIF NEW.status <> 'completed' AND OLD.status = 'completed' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_ot_completed_at ON public.ots;
CREATE TRIGGER trg_sync_ot_completed_at
BEFORE UPDATE OF status ON public.ots
FOR EACH ROW
EXECUTE FUNCTION public.sync_ot_completed_at();

-- ── 2. completed_at backfill ─────────────────────────────────
UPDATE public.ots
   SET completed_at = COALESCE(completed_at, updated_at, created_at)
 WHERE status = 'completed'
   AND completed_at IS NULL;

-- ── 3. Synthetic status history ──────────────────────────────
WITH path AS (
  SELECT p.status, p.ord
  FROM unnest(ARRAY[
    'pre_press', 'visto_bueno', 'paper_purchase', 'in_storage',
    'guillotine_first_cut', 'offset_printing', 'die_cutting',
    'guillotine_final_cut', 'workshop', 'ready_for_delivery',
    'in_delivery', 'completed'
  ]::public.ot_status[]) WITH ORDINALITY AS p(status, ord)
),
targets AS (
  SELECT
    o.id,
    o.created_at,
    GREATEST(COALESCE(o.completed_at, o.updated_at), o.created_at + interval '1 day') AS done_at
  FROM public.ots o
  WHERE o.status = 'completed'
    AND NOT EXISTS (SELECT 1 FROM public.ot_status_history h WHERE h.ot_id = o.id)
)
INSERT INTO public.ot_status_history
  (ot_id, from_status, to_status, changed_by, changed_by_role, reason, rollback, metadata, created_at)
SELECT
  t.id,
  lag(p.status) OVER (PARTITION BY t.id ORDER BY p.ord),
  p.status,
  NULL,
  'system',
  'Backfill histórico sintético (plan demo §3.2) — habilita lead times y cuellos de botella para OTs sembradas sin historial',
  false,
  jsonb_build_object('backfill', true),
  -- Interpolate along the OT's real lifespan, with ±4% deterministic jitter
  -- per (ot, step) so stage durations differ between OTs.
  t.created_at
    + (t.done_at - t.created_at)
      * LEAST(1.0, GREATEST(0.01,
          (p.ord::numeric / 12)
          + ((hashtext(t.id::text || p.ord::text) % 9) - 4)::numeric / 100
        ))
FROM targets t
CROSS JOIN path p
ORDER BY t.id, p.ord;
