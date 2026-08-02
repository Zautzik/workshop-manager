-- Dejar únicamente el lote sembrado que contiene la OT 40502.
--
-- Ese lote son dos órdenes: 40502 y 40503. Comparten el segundo exacto de
-- creación —17:11:02— pese a tener fechas distintas (24 de junio y 7 de julio),
-- que es la huella de un script que inserta con fechas retroactivas en una sola
-- corrida. Es la "historia sembrable Viña Santa Elena": una OT completada con
-- dossier FSSC y despacho, y una en prensa con OC recibida y sesión de WhatsApp
-- activa. Sirve como recorrido de demostración de punta a punta.
--
-- Se borra todo lo demás:
--   40504, 40505, 40504-B   Viña Santa Elena, creadas en el recorrido de esta
--                           sesión (timestamps individuales, minutos aparte)
--   40497-B, 40506          Comercial Norte, mismo recorrido
--   40501                   seed_11_demo
--   SMOKE-72038308/72229584 filas del test automático
--
-- Con sus adjuntos, líneas de costo, vistos buenos, facturas y guías: un
-- documento que apunta a una OT inexistente es peor que no tenerlo.

BEGIN;

CREATE TEMP TABLE a_borrar ON COMMIT DROP AS
SELECT id, ot_number FROM public.ots
 WHERE ot_number NOT IN ('40502', '40503');

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM a_borrar;
  IF n > 12 THEN
    RAISE EXCEPTION 'Se borrarían % OT, más de las esperadas. Se aborta.', n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ots WHERE ot_number = '40502')
  OR NOT EXISTS (SELECT 1 FROM public.ots WHERE ot_number = '40503') THEN
    RAISE EXCEPTION 'No están las dos OT que hay que conservar. Se aborta.';
  END IF;
END $$;

DELETE FROM public.sales_invoices  WHERE ot_id IN (SELECT id FROM a_borrar);
DELETE FROM public.dispatch_guides WHERE ot_id IN (SELECT id FROM a_borrar);
DELETE FROM public.ot_attachments  WHERE ot_id IN (SELECT id FROM a_borrar);
DELETE FROM public.ot_cost_lines   WHERE ot_id IN (SELECT id FROM a_borrar);
DELETE FROM public.ot_financials   WHERE ot_id IN (SELECT id FROM a_borrar);
DELETE FROM public.ot_real_costs   WHERE ot_id IN (SELECT id FROM a_borrar);
DELETE FROM public.capture_events  WHERE ot_id IN (SELECT id FROM a_borrar);
DELETE FROM public.vistos_buenos   WHERE ot_id IN (SELECT id FROM a_borrar);
DELETE FROM public.ots             WHERE id    IN (SELECT id FROM a_borrar);

COMMIT;
