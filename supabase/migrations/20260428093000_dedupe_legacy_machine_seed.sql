-- =====================================================
-- Cleanup legacy duplicated machine seed rows and allow
-- admins/supervisors to insert/delete machines directly.
-- =====================================================

WITH normalized AS (
  SELECT
    id,
    lower(
      CASE
        WHEN lower(name) = 'offset printer 1' THEN 'ryobi offset 524gs #1'
        WHEN lower(name) = 'offset printer 2' THEN 'ryobi offset 524gs #2'
        WHEN lower(name) = 'offset printer 3' THEN 'roland offset #1'
        WHEN lower(name) IN ('die cutter', 'die cutter 1') THEN 'die cutter #1'
        WHEN lower(name) = 'guillotine 1' THEN 'guillotine #1'
        WHEN lower(name) = 'guillotine 2' THEN 'guillotine #2'
        WHEN lower(name) = 'guillotine 3' THEN 'guillotine #3'
        WHEN lower(name) = 'delivery station' THEN 'dispatch vehicle #1'
        ELSE name
      END
    ) AS canonical_name,
    (
      CASE WHEN coalesce(is_active, false) THEN 20 ELSE 0 END +
      CASE WHEN workstation_id IS NOT NULL THEN 10 ELSE 0 END +
      CASE WHEN nullif(trim(coalesce(brand, '')), '') IS NOT NULL THEN 4 ELSE 0 END +
      CASE WHEN nullif(trim(coalesce(model, '')), '') IS NOT NULL THEN 4 ELSE 0 END +
      CASE WHEN nullif(trim(coalesce(location, '')), '') IS NOT NULL THEN 2 ELSE 0 END
    ) AS quality_score,
    updated_at,
    created_at
  FROM public.machines
), ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY canonical_name
      ORDER BY quality_score DESC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM normalized
)
DELETE FROM public.machines m
USING ranked r
WHERE m.id = r.id
  AND r.rn > 1;

DROP POLICY IF EXISTS "Admins and supervisors can insert machines" ON public.machines;
DROP POLICY IF EXISTS "Admins and supervisors can delete machines" ON public.machines;

CREATE POLICY "Admins and supervisors can insert machines"
  ON public.machines FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'supervisor')
  );

CREATE POLICY "Admins and supervisors can delete machines"
  ON public.machines FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'supervisor')
  );