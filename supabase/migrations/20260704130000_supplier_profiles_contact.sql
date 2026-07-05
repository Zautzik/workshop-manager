-- ============================================================
-- SUP1.1 — supplier_profiles: email + phone (contact details)
--
-- These were added to the SUP1 CREATE TABLE, but `CREATE TABLE IF NOT EXISTS`
-- doesn't add columns to an already-created table. This ALTER adds them for
-- installs that ran SUP1 before the columns existed. Idempotent.
-- ============================================================

ALTER TABLE public.supplier_profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;
