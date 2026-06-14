-- OT status-transition audit trail (Track 2 — MED-2)
--
-- Previously, OT status changes left no durable record: the transition routes
-- only emitted transient notifications. This table captures every workflow
-- transition (single + bulk), including rollbacks, for compliance and timeline
-- reconstruction — mirroring the HR compliance audit logging already in place.
--
-- Rows are written by the service-role API layer only; the table is immutable
-- from the client side (RLS grants SELECT to approvers, no INSERT/UPDATE/DELETE).

CREATE TABLE IF NOT EXISTS public.ot_status_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id           uuid NOT NULL REFERENCES public.ots(id) ON DELETE CASCADE,
  from_status     public.ot_status,
  to_status       public.ot_status NOT NULL,
  changed_by      uuid,            -- auth.users id (no FK: avoids cross-schema coupling)
  changed_by_role text,
  reason          text,
  rollback        boolean NOT NULL DEFAULT false,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ot_status_history_ot
  ON public.ot_status_history (ot_id, created_at DESC);

ALTER TABLE public.ot_status_history ENABLE ROW LEVEL SECURITY;

-- Approvers (admin / supervisor / manager) may read the audit trail.
-- No write policies: inserts happen exclusively via the service role, which
-- bypasses RLS. The absence of UPDATE/DELETE policies keeps the log immutable.
DROP POLICY IF EXISTS ot_status_history_select_approvers ON public.ot_status_history;
CREATE POLICY ot_status_history_select_approvers
  ON public.ot_status_history
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );
