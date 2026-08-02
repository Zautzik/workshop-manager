-- Eliminar las 15 OT sembradas cuyo cliente estaba en conflicto.
--
-- El dueño confirmó que venían de una siembra anterior que no tenía las
-- adiciones nuevas del modelo, y pidió borrarlas.
--
-- ALCANCE ACOTADO A PROPÓSITO. Las OT en conflicto eran 20, no 15. Las otras 5
-- NO se tocan y hay que decir por qué:
--
--   40481  3.500.000 etiquetas NeuroCalm       $87.957.814
--   40482  2.400.000 etiquetas AllerFree       $58.638.551
--   40490  1.800.000 etiquetas SeruNorm        $29.319.263
--   40494  3.800.000 etiquetas NeuroCalm       $92.146.363  ← 1 factura, 2 guías
--   40495  2.500.000 etiquetas AllerFree       $62.827.101
--
-- Están en la numeración real del taller (405xx), se crearon en fechas
-- separadas entre abril y junio, tienen tirajes y precios verosímiles, líneas
-- de costo real, y nombres de producto farmacéutico concretos. La 40494 además
-- tiene FACTURA DE VENTA y DOS GUÍAS DE DESPACHO: es trabajo facturado y
-- despachado. Borrarla dejaría un hueco en el expediente de trazabilidad, que
-- es exactamente lo que una auditoría FSSC 22000 no perdona.
--
-- Su conflicto de cliente es real y sigue pendiente de una decisión humana.
--
-- Las 15 que sí se borran no tienen factura, guía, adjunto, compra ni
-- asignación de personal: sólo 180 líneas de costo y 15 filas de ot_financials,
-- que se van con ellas. Entre las 15 facturan $1.842 en total.

BEGIN;

CREATE TEMP TABLE ot_a_borrar ON COMMIT DROP AS
SELECT o.id, o.ot_number
  FROM public.ots o
  JOIN public.clients c ON c.id = o.client_id
 WHERE lower(btrim(o.client_name)) <> lower(btrim(c.name))
   AND o.ot_number LIKE 'OT-%';

-- Red de seguridad: si el conjunto no es exactamente el esperado, se aborta.
-- Nada de borrar "lo que haya" en producción.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM ot_a_borrar;
  IF n <> 15 THEN
    RAISE EXCEPTION 'Se esperaban 15 OT sembradas en conflicto y se encontraron %. Se aborta.', n;
  END IF;

  IF EXISTS (SELECT 1 FROM public.sales_invoices WHERE ot_id IN (SELECT id FROM ot_a_borrar))
     OR EXISTS (SELECT 1 FROM public.dispatch_guides WHERE ot_id IN (SELECT id FROM ot_a_borrar)) THEN
    RAISE EXCEPTION 'Alguna de las OT a borrar tiene factura o guía de despacho. Se aborta.';
  END IF;
END $$;

DELETE FROM public.ot_cost_lines  WHERE ot_id IN (SELECT id FROM ot_a_borrar);
DELETE FROM public.ot_financials  WHERE ot_id IN (SELECT id FROM ot_a_borrar);
DELETE FROM public.ot_real_costs  WHERE ot_id IN (SELECT id FROM ot_a_borrar);
DELETE FROM public.ots            WHERE id    IN (SELECT id FROM ot_a_borrar);

COMMIT;
