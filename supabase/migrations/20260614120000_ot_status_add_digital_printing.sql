-- Align database enums with values the application already uses.
--
-- Two enum values were used throughout the app code (state machine, kanban UI,
-- craft-skill paths, OT operation forms) but were never added to the database
-- enums, so any write using them would fail at runtime with an
-- invalid-enum-value error:
--   • ot_status            → missing 'digital_printing' (alt. to offset_printing)
--   • ot_operation_category→ missing 'tercerizado' (outsourced work)
--
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block in some
-- Postgres versions; run this migration on its own.

ALTER TYPE public.ot_status ADD VALUE IF NOT EXISTS 'digital_printing' AFTER 'offset_printing';
ALTER TYPE public.ot_operation_category ADD VALUE IF NOT EXISTS 'tercerizado' AFTER 'terminaciones';
