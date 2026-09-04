-- El ledger se suma en Postgres, no en Node
--
-- /api/ots/cost-summary bajaba TODAS las líneas de `ot_cost_lines` para las OT
-- pedidas (4.256+ y creciendo) y hacía la suma por kind/category/source en
-- JavaScript, con `fetchAll` paginando de a 1.000 para no repetir el
-- truncamiento silencioso que esta misma pantalla ya sufrió una vez
-- (COSTO REAL leído en $809M cuando era ~$3.283M, margen 82% en vez de 22% --
-- ver fetch-all.ts). La paginación arregla el truncamiento; no arregla que
-- cada carga de la pantalla siga bajando una fila por cada línea de costo
-- que exista, sólo para sumarlas.
--
-- `idx_ot_cost_lines_ot` (cost_ledger.sql) ya cubre `WHERE ot_id = ANY(...)`
-- -- no hace falta un índice nuevo, el plan ya usa ese Index Scan. Lo que
-- faltaba era dejar que Postgres hiciera la suma ahí mismo, en vez de leer la
-- fila, mandarla por HTTP, deserializarla en V8, y recién ahí sumarla
-- (auditoría de rendimiento 2026-09-08).
--
-- La lógica de PROCEDENCIA (realLines vs legacyLines vs seedLines vs
-- estimateLines, con seedLines contado SIEMPRE sobre el total sin filtrar)
-- replica exactamente lo que hacía `rollupCosts` en cost-rollup.ts -- ver
-- rollupFromDbAggregates(), que arma el mismo OTCostRollup[] a partir de esta
-- función en vez de a partir de las líneas crudas.

CREATE OR REPLACE FUNCTION public.ot_cost_rollup(
  p_ot_ids uuid[],
  p_include_seed boolean DEFAULT false
)
RETURNS TABLE (
  ot_id uuid,
  estimated_cost numeric,
  actual_cost numeric,
  committed_cost numeric,
  material_actual numeric,
  labor_actual numeric,
  machine_actual numeric,
  finishing_actual numeric,
  outsourced_actual numeric,
  overhead_actual numeric,
  other_actual numeric,
  real_lines integer,
  legacy_lines integer,
  seed_lines integer,
  estimate_lines integer
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    cl.ot_id,
    COALESCE(SUM(cl.total) FILTER (WHERE cl.kind = 'estimate'  AND (p_include_seed OR cl.source <> 'seed')), 0),
    COALESCE(SUM(cl.total) FILTER (WHERE cl.kind = 'actual'    AND (p_include_seed OR cl.source <> 'seed')), 0),
    COALESCE(SUM(cl.total) FILTER (WHERE cl.kind = 'committed' AND (p_include_seed OR cl.source <> 'seed')), 0),
    COALESCE(SUM(cl.total) FILTER (WHERE cl.kind='actual' AND cl.category='material'   AND (p_include_seed OR cl.source<>'seed')), 0),
    COALESCE(SUM(cl.total) FILTER (WHERE cl.kind='actual' AND cl.category='labor'      AND (p_include_seed OR cl.source<>'seed')), 0),
    COALESCE(SUM(cl.total) FILTER (WHERE cl.kind='actual' AND cl.category='machine'    AND (p_include_seed OR cl.source<>'seed')), 0),
    COALESCE(SUM(cl.total) FILTER (WHERE cl.kind='actual' AND cl.category='finishing'  AND (p_include_seed OR cl.source<>'seed')), 0),
    COALESCE(SUM(cl.total) FILTER (WHERE cl.kind='actual' AND cl.category='outsourced' AND (p_include_seed OR cl.source<>'seed')), 0),
    COALESCE(SUM(cl.total) FILTER (WHERE cl.kind='actual' AND cl.category='overhead'   AND (p_include_seed OR cl.source<>'seed')), 0),
    COALESCE(SUM(cl.total) FILTER (WHERE cl.kind='actual' AND cl.category='other'      AND (p_include_seed OR cl.source<>'seed')), 0),
    -- realLines/legacyLines/estimateLines: sobre el mismo subconjunto que
    -- `usables` en rollupCosts (seed excluido salvo p_include_seed) --
    -- realLines es "actual y no legacy" DENTRO de usables, así que con
    -- p_include_seed=true una línea sembrada SÍ cuenta como realLine, igual
    -- que hacía rollupCosts (`l.source !== 'legacy'`, sin excluir seed aparte
    -- -- lo excluía sólo `usables`, que con include_seed=true no la saca).
    -- Encontrado por prueba directa contra Postgres, no a simple vista: la
    -- primera versión de esta función excluía seed de realLines siempre,
    -- que no es lo que hacía el JS que reemplaza.
    COUNT(*) FILTER (WHERE cl.kind='actual' AND cl.source<>'legacy' AND (p_include_seed OR cl.source<>'seed'))::int,
    COUNT(*) FILTER (WHERE cl.kind='actual' AND cl.source='legacy')::int,
    -- seedLines: SIEMPRE sobre el total sin filtrar -- es la señal de "esta OT
    -- tiene siembra adentro", y tiene que verse incluso cuando se excluye.
    COUNT(*) FILTER (WHERE cl.source='seed')::int,
    COUNT(*) FILTER (WHERE cl.kind='estimate' AND (p_include_seed OR cl.source<>'seed'))::int
  FROM public.ot_cost_lines cl
  WHERE cl.ot_id = ANY(p_ot_ids)
  GROUP BY cl.ot_id;
$$;

COMMENT ON FUNCTION public.ot_cost_rollup(uuid[], boolean) IS
  'Suma y cuenta ot_cost_lines por OT, agrupado por kind/category/source. Reemplaza el
   fetchAll + suma-en-JS que tenía /api/ots/cost-summary -- misma semántica que
   rollupCosts() en cost-rollup.ts, ejecutada donde ya viven las filas.';

GRANT EXECUTE ON FUNCTION public.ot_cost_rollup(uuid[], boolean) TO authenticated, service_role;
