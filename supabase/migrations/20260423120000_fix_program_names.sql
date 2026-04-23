-- =====================================================
-- Fix stale program names from old seed run
-- =====================================================
-- The original seed incorrectly labeled both programs as "Ryobi 524GS"
-- and appended "(Manual Alemán / Japonés)" to the names.
-- source_language ('de' / 'ja') was always set correctly, so we use it
-- as the discriminator to restore the proper names.
-- =====================================================

UPDATE public.maintenance_programs
SET
  name          = 'Roland — Programa Técnico de Mantenimiento',
  machine_model = 'Roland'
WHERE source_language = 'de'
  AND is_active = true;

UPDATE public.maintenance_programs
SET
  name          = 'Ryobi 524GS — Registro Semanal de Mantenimiento',
  machine_model = 'Ryobi 524GS'
WHERE source_language = 'ja'
  AND is_active = true;
