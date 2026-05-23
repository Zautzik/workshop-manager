-- ─────────────────────────────────────────────────────────────────────────────
-- machines: explicit RLS write policies
--
-- Context
-- -------
-- The original migration only created SELECT and UPDATE (supervisor-only)
-- policies. INSERT and DELETE had no policy → implicit deny.
-- This was safe while all writes went through supabaseAdmin (service role,
-- bypasses RLS), but the browser Supabase client is now seeded with a real JWT
-- via setSession(). That makes RLS the enforced security layer for any direct
-- client call, so the policies must be explicit and must match the app-layer
-- auth in the API routes (POST/PATCH/DELETE all use requireAuth(['supervisor','admin'])).
--
-- Changes
-- -------
-- 1. Drop the existing UPDATE policy that only covers 'supervisor'.
-- 2. Replace with UPDATE, INSERT, and DELETE policies that cover both
--    'supervisor' and 'admin', matching the API route requireAuth() calls.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Drop the old supervisor-only UPDATE policy
DROP POLICY IF EXISTS "Supervisors can update machines" ON public.machines;

-- 2. UPDATE — supervisors and admins (matches PATCH /api/machines/[id])
CREATE POLICY "Supervisors and admins can update machines"
  ON public.machines FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor') OR
    public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'supervisor') OR
    public.has_role(auth.uid(), 'admin')
  );

-- 3. INSERT — supervisors and admins (matches POST /api/machines)
CREATE POLICY "Supervisors and admins can insert machines"
  ON public.machines FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'supervisor') OR
    public.has_role(auth.uid(), 'admin')
  );

-- 4. DELETE — supervisors and admins (matches DELETE /api/machines/[id])
CREATE POLICY "Supervisors and admins can delete machines"
  ON public.machines FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor') OR
    public.has_role(auth.uid(), 'admin')
  );
