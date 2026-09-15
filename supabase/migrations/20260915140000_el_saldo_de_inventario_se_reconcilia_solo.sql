-- El saldo de inventario se reconcilia solo
--
-- `inventory_lots.quantity_available` no se recalcula nunca: lo mantiene un
-- trigger BEFORE INSERT en `inventory_stock_transactions` que suma o resta un
-- delta sobre el valor anterior (`sync_inventory_lot_quantities`, ver
-- 20260303113000). Eso es rápido y evita el problema clásico de recalcular un
-- SUM() en cada lectura, pero tiene un costo: si algo escribe
-- `quantity_available` por otra vía —una consola SQL, un script, una
-- corrección a mano— el saldo y el libro de movimientos divergen en silencio
-- y nada se entera hasta que alguien cuenta el papel físico y no cuadra.
--
-- Esto no reemplaza el trigger ni cambia cómo se escribe el saldo. Es la
-- misma pregunta que `cron_status()` ya contesta para el cierre de costos,
-- aplicada al inventario: ¿el saldo guardado sigue siendo lo que dice el
-- libro? Si no, queda una alerta abierta hasta que se resuelva o se explique.
--
-- Nota para quien lea esto contra datos de demo: algunos seeds insertan
-- `quantity_available` directo, sin pasar por una transacción — para esos
-- lotes esta función va a marcar «desviación» aunque no sea un bug, sólo el
-- atajo propio de datos de prueba. Contra producción (todo entra por
-- receive_oc_into_lot o sale por consumir_lote) el chequeo es real.

BEGIN;

CREATE TABLE IF NOT EXISTS public.inventory_reconciliation_alerts (
  lot_id             UUID PRIMARY KEY REFERENCES public.inventory_lots(id) ON DELETE CASCADE,
  item_id            UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity_available NUMERIC(12,3) NOT NULL,
  quantity_ledger    NUMERIC(12,3) NOT NULL,
  drift              NUMERIC(12,3) NOT NULL,
  detected_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.inventory_reconciliation_alerts IS
  'Lotes cuyo quantity_available no coincide con la suma de sus inventory_stock_transactions. Sólo alertas abiertas: un lote que vuelve a cuadrar sale de la tabla — no es un historial, es la lista de lo pendiente.';

ALTER TABLE public.inventory_reconciliation_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_reconciliation_alerts_select ON public.inventory_reconciliation_alerts;
CREATE POLICY inventory_reconciliation_alerts_select ON public.inventory_reconciliation_alerts
  FOR SELECT TO authenticated USING (true);

-- ─── El chequeo ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reconciliar_inventario()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH libro AS (
    SELECT
      l.id AS lot_id,
      l.item_id,
      l.quantity_available,
      COALESCE(SUM(
        CASE WHEN t.tx_type IN ('purchase', 'adjustment_in', 'return_to_stock') THEN t.quantity
             WHEN t.tx_type IN ('consumption', 'adjustment_out') THEN -t.quantity
             ELSE 0 END
      ), 0) AS quantity_ledger
    FROM public.inventory_lots l
    LEFT JOIN public.inventory_stock_transactions t ON t.lot_id = l.id
    GROUP BY l.id, l.item_id, l.quantity_available
  )
  INSERT INTO public.inventory_reconciliation_alerts
    (lot_id, item_id, quantity_available, quantity_ledger, drift, detected_at)
  SELECT lot_id, item_id, quantity_available, quantity_ledger,
         quantity_available - quantity_ledger, now()
  FROM libro
  WHERE quantity_available <> quantity_ledger
  ON CONFLICT (lot_id) DO UPDATE SET
    quantity_available = EXCLUDED.quantity_available,
    quantity_ledger     = EXCLUDED.quantity_ledger,
    drift               = EXCLUDED.drift,
    detected_at         = now();

  -- Un lote que vuelve a cuadrar sale de la lista de alertas abiertas.
  WITH libro AS (
    SELECT
      l.id AS lot_id,
      l.quantity_available,
      COALESCE(SUM(
        CASE WHEN t.tx_type IN ('purchase', 'adjustment_in', 'return_to_stock') THEN t.quantity
             WHEN t.tx_type IN ('consumption', 'adjustment_out') THEN -t.quantity
             ELSE 0 END
      ), 0) AS quantity_ledger
    FROM public.inventory_lots l
    LEFT JOIN public.inventory_stock_transactions t ON t.lot_id = l.id
    GROUP BY l.id, l.quantity_available
  )
  DELETE FROM public.inventory_reconciliation_alerts a
  USING libro b
  WHERE a.lot_id = b.lot_id AND b.quantity_available = b.quantity_ledger;

  SELECT count(*) INTO v_count FROM public.inventory_reconciliation_alerts;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconciliar_inventario() TO authenticated;

COMMENT ON FUNCTION public.reconciliar_inventario IS
  'Compara quantity_available contra la suma firmada de inventory_stock_transactions por lote. Devuelve cuántas alertas quedaron abiertas después de correr.';

-- ─── Agendado, con el mismo resguardo que el cierre de costos ──────────────
--
-- Sólo se agenda si pg_cron está disponible en este plan de Supabase. Si no
-- lo está, la función queda creada igual y se puede correr a mano —
-- `SELECT public.reconciliar_inventario();`— mientras tanto.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'inventory_reconciliation_daily';
  PERFORM cron.schedule(
    'inventory_reconciliation_daily',
    '32 3 * * *',
    $CRON$SELECT public.reconciliar_inventario();$CRON$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No se pudo agendar la reconciliación automática (pg_cron no disponible): %', SQLERRM;
END $$;

-- ─── cron_status() ahora reporta los dos trabajos ──────────────────────────
--
-- Cambia de forma (una fila por trabajo en vez de una fila fija) — Postgres no
-- deja alterar el tipo de retorno de una función con CREATE OR REPLACE, así
-- que se elimina y se vuelve a crear. Nada en la aplicación la llama (es un
-- diagnóstico de `SELECT * FROM cron_status();` a mano); sólo se regenera
-- types.ts si alguna pantalla llega a usarla.
DROP FUNCTION IF EXISTS public.cron_status();

CREATE OR REPLACE FUNCTION public.cron_status()
RETURNS TABLE (job_name TEXT, extension_installed BOOLEAN, job_scheduled BOOLEAN, schedule TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ext BOOLEAN;
BEGIN
  v_ext := EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron');

  RETURN QUERY
  SELECT
    j.name,
    v_ext,
    v_ext AND EXISTS (SELECT 1 FROM cron.job c WHERE c.jobname = j.name),
    CASE WHEN v_ext THEN (SELECT c.schedule FROM cron.job c WHERE c.jobname = j.name) END
  FROM (VALUES ('cost_variance_monthly_close'), ('inventory_reconciliation_daily')) AS j(name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cron_status() TO authenticated;

COMMENT ON FUNCTION public.cron_status() IS
  'Diagnóstico manual: por cada trabajo agendado, si pg_cron está instalado y si el agendado realmente prendió. Ver docs/spec — pg_cron no está garantizado en todos los planes de Supabase.';

COMMIT;
