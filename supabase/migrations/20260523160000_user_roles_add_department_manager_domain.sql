-- user_roles was created with only (id, user_id, role, created_at).
-- The admin users API has always expected department and manager_domain on this
-- table but the columns were never added, making every admin-created user silently
-- fail the role INSERT via PostgREST (unknown column → HTTP 400).
--
-- This migration adds the two columns as nullable TEXT so:
--  • Existing rows are unaffected (NULL backfill).
--  • New users created via POST /api/admin/users get their department stored.
--  • PATCH /api/admin/users can update department / manager_domain.

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS department     TEXT,
  ADD COLUMN IF NOT EXISTS manager_domain TEXT;
