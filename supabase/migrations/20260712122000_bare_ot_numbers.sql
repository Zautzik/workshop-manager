-- ============================================================
-- Bare OT numbers: '40502' instead of 'OT-40502' (owner decision 2026-07-12)
--
-- The plant lives typing these numbers dozens of times a day — WhatsApp
-- reports, searches, phone calls. The 'OT-' prefix is pure ceremony: the
-- column is already unique, workers already say "la 40502", and the parser
-- extracts digits anyway. UIs that want the prefix render it visually.
--
-- 1) Data: strip the prefix from plain correlatives (^OT-[0-9]+$ only).
--    Legacy 'OT-YYYY-NNNN' seeds and audit-test rows are left untouched —
--    they're 3.1-purge material, and stripping them wouldn't yield a number.
-- 2) generate_ot_number(): returns the bare correlative. MAX scans both bare
--    and any still-prefixed rows so environments migrated mid-stream can't
--    mint a duplicate.
--
-- Lookups stay tolerant of both forms (WhatsApp routes already query
-- ot_number IN (N, 'OT-N')), so nothing breaks either direction.
-- ============================================================

UPDATE public.ots
   SET ot_number = substring(ot_number from 4)
 WHERE ot_number ~ '^OT-[0-9]+$';

CREATE OR REPLACE FUNCTION public.generate_ot_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next BIGINT;
BEGIN
  SELECT COALESCE(MAX(
    CASE
      WHEN ot_number ~ '^[0-9]+$'    THEN ot_number::bigint
      WHEN ot_number ~ '^OT-[0-9]+$' THEN substring(ot_number from 4)::bigint
    END
  ), 40500) + 1
    INTO v_next
  FROM public.ots;
  RETURN v_next::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_ot_number() TO authenticated;

COMMENT ON FUNCTION public.generate_ot_number() IS
  'Next plant correlative OT number, bare digits (e.g. 40502). Single source — wizard endpoint and convert_vb_to_ot().';
