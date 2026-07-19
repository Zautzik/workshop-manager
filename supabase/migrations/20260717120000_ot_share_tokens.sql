-- ============================================================
-- P5.5 (demo-readiness plan §Phase 5) — dedicated share tokens for the
-- public order tracker
--
-- /track/[token] used the OT's PRIMARY KEY as its "unguessable token"
-- (2026-07 audit): the same uuid circulating in every internal API response
-- and screenshot, with no way to revoke. A leaked id = permanent public
-- access to client name and order details.
--
-- share_token is a separate random uuid: leaking an internal id no longer
-- exposes anything, and revocation = regenerating the token (the app updates
-- the column; old links die instantly).
-- ============================================================

ALTER TABLE public.ots
  ADD COLUMN IF NOT EXISTS share_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_ots_share_token ON public.ots(share_token);

COMMENT ON COLUMN public.ots.share_token IS
  'Public tracker token (/track/[share_token]). Regenerate to revoke shared links. Never expose the primary key instead.';
