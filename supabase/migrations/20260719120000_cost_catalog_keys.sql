-- ============================================================
-- P6.3 (demo-readiness plan §Phase 6) — stable keys for the cost catalog
--
-- The costing resolver matched catalog lines by EXACT seed name: renaming
-- "Offset 4 Colores" silently dropped every quote to the engine's toy
-- default ($25.000/h vs $85.000/h — a 3.4× mispricing with zero warning).
--
-- catalog_key is a machine-readable identity that survives renames. The
-- resolver matches key-first, name-fallback, so unkeyed custom rows keep
-- working. Backfills are guarded by name — a missing row updates nothing.
-- ============================================================

ALTER TABLE public.cost_catalog
  ADD COLUMN IF NOT EXISTS catalog_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_catalog_key
  ON public.cost_catalog(catalog_key) WHERE catalog_key IS NOT NULL;

UPDATE public.cost_catalog SET catalog_key = 'offset_1c'              WHERE name = 'Offset 1 Color'              AND catalog_key IS NULL;
UPDATE public.cost_catalog SET catalog_key = 'offset_2c'              WHERE name = 'Offset 2 Colores'            AND catalog_key IS NULL;
UPDATE public.cost_catalog SET catalog_key = 'offset_4c'              WHERE name = 'Offset 4 Colores'            AND catalog_key IS NULL;
UPDATE public.cost_catalog SET catalog_key = 'corte_guillotina'       WHERE name = 'Corte Final (Guillotina)'    AND catalog_key IS NULL;
UPDATE public.cost_catalog SET catalog_key = 'troquelado'             WHERE name = 'Troquelado'                  AND catalog_key IS NULL;
UPDATE public.cost_catalog SET catalog_key = 'doblado'                WHERE name = 'Doblado'                     AND catalog_key IS NULL;
UPDATE public.cost_catalog SET catalog_key = 'pegado_automatico'      WHERE name = 'Pegado Automático'           AND catalog_key IS NULL;
UPDATE public.cost_catalog SET catalog_key = 'laminado'               WHERE name = 'Laminado'                    AND catalog_key IS NULL;
UPDATE public.cost_catalog SET catalog_key = 'barniz'                 WHERE name = 'Barniz UV'                   AND catalog_key IS NULL;
UPDATE public.cost_catalog SET catalog_key = 'relieve'                WHERE name = 'Relieve (Cuño)'              AND catalog_key IS NULL;
UPDATE public.cost_catalog SET catalog_key = 'perforado'              WHERE name = 'Perforado'                   AND catalog_key IS NULL;
UPDATE public.cost_catalog SET catalog_key = 'hot_stamping'           WHERE name = 'Hot Stamping'                AND catalog_key IS NULL;
UPDATE public.cost_catalog SET catalog_key = 'uv_localizado'          WHERE name = 'UV Localizado'               AND catalog_key IS NULL;
UPDATE public.cost_catalog SET catalog_key = 'numeracion'             WHERE name = 'Numeración'                  AND catalog_key IS NULL;
UPDATE public.cost_catalog SET catalog_key = 'plancha_ctp'            WHERE name = 'Plancha CTP'                 AND catalog_key IS NULL;
UPDATE public.cost_catalog SET catalog_key = 'tinta_cmyk'             WHERE name = 'Tinta Offset CMYK'           AND catalog_key IS NULL;
UPDATE public.cost_catalog SET catalog_key = 'operador_prensa'        WHERE name = 'Operador de Prensa'          AND catalog_key IS NULL;
UPDATE public.cost_catalog SET catalog_key = 'operador_terminaciones' WHERE name = 'Operador de Terminaciones'   AND catalog_key IS NULL;
UPDATE public.cost_catalog SET catalog_key = 'overhead_general'       WHERE name = 'Gastos Generales (% sobre costo)' AND catalog_key IS NULL;

COMMENT ON COLUMN public.cost_catalog.catalog_key IS
  'Stable machine-readable identity for the costing resolver (rename-safe). Null for custom rows (name-matched as fallback).';
