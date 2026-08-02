-- Retirar el resto de la siembra de demostración.
--
-- El dueño confirmó: la serie OT-AAAA-NNN es data de demo de versiones
-- anteriores de la app, no son órdenes reales de la empresa. Fluff.
--
-- Son 50 OT (ya se habían borrado 15 en la migración anterior, las que además
-- tenían conflicto de cliente). Entre las 65 originales facturaban $8.288 EN
-- TOTAL — sesenta y cinco órdenes de trabajo sumando menos que el almuerzo de
-- un día. Esa sola cifra bastaba para saber que no describían nada real.
--
-- Se llevan consigo 600 líneas de costo —que resultan ser EXACTAMENTE las 600
-- `estimate/wizard` del ledger— y 50 filas de ot_financials. O sea que después
-- de esto el libro de costos deja de ser 92% estimaciones y pasa a ser
-- mayoritariamente costo real, que era el hallazgo #02 de la auditoría.
--
-- Verificado antes de borrar: ninguna tiene factura de venta, guía de despacho,
-- adjunto, orden de compra, asignación de personal ni visto bueno. No se pierde
-- ningún rastro de trazabilidad, porque no hay ninguno que perder.
--
-- Las 5 OT de la serie 405xx que quedan con conflicto de cliente NO se tocan:
-- son trabajo real (una con factura y dos guías) y su conflicto sigue esperando
-- una decisión humana sobre a qué cliente pertenecen.

BEGIN;

CREATE TEMP TABLE ot_demo ON COMMIT DROP AS
SELECT id, ot_number FROM public.ots WHERE ot_number LIKE 'OT-%';

-- Mismas redes que la vez anterior: si aparece cualquier rastro real, se aborta
-- entero en vez de borrar "lo que haya".
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM ot_demo;
  IF n = 0 THEN
    RAISE NOTICE 'No quedan OT de la serie sembrada. Nada que hacer.';
  ELSIF n > 60 THEN
    RAISE EXCEPTION 'Se encontraron % OT sembradas, más de las esperadas. Se aborta por seguridad.', n;
  END IF;

  IF EXISTS (SELECT 1 FROM public.sales_invoices  WHERE ot_id IN (SELECT id FROM ot_demo))
  OR EXISTS (SELECT 1 FROM public.dispatch_guides WHERE ot_id IN (SELECT id FROM ot_demo))
  OR EXISTS (SELECT 1 FROM public.purchases       WHERE ot_id IN (SELECT id FROM ot_demo))
  OR EXISTS (SELECT 1 FROM public.ot_attachments  WHERE ot_id IN (SELECT id FROM ot_demo)) THEN
    RAISE EXCEPTION 'Alguna OT de la serie sembrada tiene factura, guía, compra o adjunto: no es demo. Se aborta.';
  END IF;
END $$;

DELETE FROM public.ot_cost_lines WHERE ot_id IN (SELECT id FROM ot_demo);
DELETE FROM public.ot_financials WHERE ot_id IN (SELECT id FROM ot_demo);
DELETE FROM public.ot_real_costs WHERE ot_id IN (SELECT id FROM ot_demo);
DELETE FROM public.ots           WHERE id    IN (SELECT id FROM ot_demo);

COMMIT;
