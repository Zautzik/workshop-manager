-- Retirar el lote sembrado de abril–junio (40481–40500).
--
-- Es el mismo conjunto del que salieron las 5 en conflicto ya borradas:
-- numeración secuencial corrida, notas con la convención "⚡ CARGA GRANDE",
-- 4–5 líneas de costo cada una, y facturas/guías generadas por el mismo
-- sembrador. Quedan 15 después de las bajas anteriores.
--
-- Con esto se va también el 100% de la base sobre la que se calculaba el margen
-- de 17,2% y la señal de "19 trabajos con 24% de sobrecosto". Ese número era
-- consistente porque venía de un generador, no porque el motor de costeo
-- estuviera mal calibrado. Conviene decirlo: la señal se desvanece con los
-- datos que la producían, y la calibración real sigue dependiendo de los tres
-- trabajos históricos de Guillermo.

BEGIN;

CREATE TEMP TABLE lote ON COMMIT DROP AS
SELECT id, ot_number FROM public.ots
 WHERE ot_number ~ '^4048[1-9]$|^4049[0-9]$|^40500$';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM lote;
  IF n = 0 THEN
    RAISE NOTICE 'El lote ya no existe.';
  ELSIF n > 20 THEN
    RAISE EXCEPTION 'El lote tiene % OT, más de las esperadas. Se aborta.', n;
  END IF;
END $$;

DELETE FROM public.sales_invoices  WHERE ot_id IN (SELECT id FROM lote);
DELETE FROM public.dispatch_guides WHERE ot_id IN (SELECT id FROM lote);
DELETE FROM public.ot_cost_lines   WHERE ot_id IN (SELECT id FROM lote);
DELETE FROM public.ot_financials   WHERE ot_id IN (SELECT id FROM lote);
DELETE FROM public.ot_real_costs   WHERE ot_id IN (SELECT id FROM lote);
DELETE FROM public.ot_attachments  WHERE ot_id IN (SELECT id FROM lote);
DELETE FROM public.ots             WHERE id    IN (SELECT id FROM lote);

COMMIT;
