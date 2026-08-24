-- El costo real no llegaba al margen
--
-- `ot_real_costs` (mano de obra, inferencia de WhatsApp, recepción de OC) y
-- `ot_cost_lines` (lo que lee /api/ots/cost-summary y toda pantalla de
-- Rentabilidad) se reconciliaron UNA VEZ, con un respaldo estático el
-- 2026-06-28. Desde entonces no hay disparador ni sincronización de ningún
-- tipo entre las dos. Cada costo real posteado automáticamente desde esa
-- fecha —cada turno de mano de obra, cada inferencia de WhatsApp, cada
-- recepción de papel contra una OT— quedó invisible para el margen que la
-- aplicación le muestra al dueño del taller (auditoría 2026-08).
--
-- La solución no reescribe a quien ya escribe en `ot_real_costs` — tres
-- rutas lo hacen hoy (labor-costs, real-costs manual, receive_oc_into_lot) y
-- reescribir las tres es más riesgo del que este arreglo necesita correr.
-- En cambio, un disparador espeja cada fila nueva hacia `ot_cost_lines` como
-- `kind='actual'`, y uno de borrado limpia el espejo cuando el ciclo de
-- reemplazo (insertar-primero, borrar-después) retira una fila vieja — el
-- mismo contrato que labor-costs y real-costs ya usan entre sí.
--
-- El vocabulario de categoría nunca coincidió entre las dos tablas:
-- `ot_real_costs.category` es texto libre (materiales/papel/tinta/impresion/
-- guillotina/energia/terminaciones/tercerizado/mano_de_obra); `ot_cost_lines
-- .category` es el enum de 7 valores. El mapeo vive en una sola función para
-- que no haya una segunda copia de esta lista en otro archivo.

BEGIN;

CREATE OR REPLACE FUNCTION public.map_real_cost_category(p_category TEXT)
RETURNS public.cost_line_category
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_category
    WHEN 'materiales'    THEN 'material'::public.cost_line_category
    WHEN 'papel'         THEN 'material'::public.cost_line_category
    WHEN 'tinta'         THEN 'material'::public.cost_line_category
    WHEN 'impresion'     THEN 'machine'::public.cost_line_category
    WHEN 'guillotina'    THEN 'machine'::public.cost_line_category
    WHEN 'energia'       THEN 'overhead'::public.cost_line_category
    WHEN 'terminaciones' THEN 'finishing'::public.cost_line_category
    WHEN 'tercerizado'   THEN 'outsourced'::public.cost_line_category
    WHEN 'mano_de_obra'  THEN 'labor'::public.cost_line_category
    ELSE 'other'::public.cost_line_category
  END;
$$;

COMMENT ON FUNCTION public.map_real_cost_category(TEXT) IS
  'Traduce la categoria de texto libre de ot_real_costs al enum cost_line_category que lee /api/ots/cost-summary. Punto unico donde las dos listas se encuentran — si ot_real_costs gana una categoria nueva, se agrega ACA, no en cada escritor.';

CREATE OR REPLACE FUNCTION public.sync_real_cost_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.ot_cost_lines (
    ot_id, kind, category, description, quantity, unit, unit_cost,
    occurred_at, recorded_by, source, ref_type, ref_id, notes
  ) VALUES (
    NEW.ot_id, 'actual', public.map_real_cost_category(NEW.category),
    NEW.description, NEW.quantity, NEW.unit, NEW.unit_cost,
    NEW.created_at, NEW.recorded_by, NEW.workflow_step,
    -- `ot_cost_lines.ref_id` es UUID, no TEXT — el error que la corrida en
    -- vivo encontró (42883, "operator does not exist: uuid = text").
    -- Los tipos generados por Supabase-js colapsan ambos a `string`, así
    -- que TypeScript no lo iba a atrapar; sólo empujar el push lo hizo.
    'ot_real_cost', NEW.id,
    NULLIF(concat_ws(' - ', NEW.operation_code, NEW.notes), '')
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_real_cost_to_ledger() IS
  'Espeja un INSERT en ot_real_costs hacia ot_cost_lines (kind=actual). No toca nada que ya escriba en ot_real_costs — labor-costs, real-costs manual y receive_oc_into_lot siguen exactamente igual.';

DROP TRIGGER IF EXISTS trg_sync_real_cost_to_ledger ON public.ot_real_costs;
CREATE TRIGGER trg_sync_real_cost_to_ledger
  AFTER INSERT ON public.ot_real_costs
  FOR EACH ROW EXECUTE FUNCTION public.sync_real_cost_to_ledger();

-- Limpieza al reemplazar: labor-costs y real-costs manual insertan primero y
-- borran las filas viejas despues (para que un insert fallido nunca pierda
-- el costo del dia). Sin esto, cada recalculo dejaria una linea fantasma
-- en ot_cost_lines apuntando a una fila de ot_real_costs que ya no existe,
-- y el margen se iria duplicando en cada correccion.
CREATE OR REPLACE FUNCTION public.unsync_real_cost_from_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.ot_cost_lines
   WHERE ref_type = 'ot_real_cost' AND ref_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_unsync_real_cost_from_ledger ON public.ot_real_costs;
CREATE TRIGGER trg_unsync_real_cost_from_ledger
  AFTER DELETE ON public.ot_real_costs
  FOR EACH ROW EXECUTE FUNCTION public.unsync_real_cost_from_ledger();

-- Retroactivo: todo lo posteado desde el respaldo del 2026-06-28 que el
-- disparador nuevo no vio nacer.
INSERT INTO public.ot_cost_lines (
  ot_id, kind, category, description, quantity, unit, unit_cost,
  occurred_at, recorded_by, source, ref_type, ref_id, notes
)
SELECT
  rc.ot_id, 'actual', public.map_real_cost_category(rc.category),
  rc.description, rc.quantity, rc.unit, rc.unit_cost,
  rc.created_at, rc.recorded_by, rc.workflow_step,
  'ot_real_cost', rc.id,
  NULLIF(concat_ws(' - ', rc.operation_code, rc.notes), '')
FROM public.ot_real_costs rc
WHERE NOT EXISTS (
  SELECT 1 FROM public.ot_cost_lines cl
   WHERE cl.ref_type = 'ot_real_cost' AND cl.ref_id = rc.id
);

COMMIT;
