-- Borrar las 5 OT en conflicto de cliente (LabelCorp / Gatorade).
--
-- El dueño confirmó por segunda vez que vienen de una siembra anterior sin las
-- adiciones nuevas del modelo. Se planteó la objeción —una de ellas tiene
-- factura de venta y dos guías de despacho— y la decisión se mantuvo.
--
-- CORRECCIÓN AL ARGUMENTO QUE SE HABÍA DADO. Se sostuvo que la 40494 debía ser
-- real *porque* tenía factura y guías. Ese argumento no se sostiene: la 40488
-- (Distribuidora Global) y la 40492 (PackBrands) también tienen factura y guía,
-- y pertenecen al mismo lote de abril–junio, con la misma numeración
-- secuencial, la misma convención de nota "⚡ CARGA GRANDE" y las mismas 4–5
-- líneas de costo. La siembra generaba facturas y guías igual que generaba
-- todo lo demás; tenerlas no prueba nada.
--
-- Las 5:
--   40481  LabelCorp S.A.  $87.957.814
--   40482  LabelCorp S.A.  $58.638.551
--   40490  LabelCorp S.A.  $29.319.263
--   40494  LabelCorp S.A.  $92.146.363   (1 factura, 2 guías)
--   40495  LabelCorp S.A.  $62.827.101
--
-- Se borran también su factura, sus guías y sus líneas de costo, porque un
-- documento huérfano de una OT inexistente es peor que no tenerlo.

BEGIN;

CREATE TEMP TABLE ot_conflicto ON COMMIT DROP AS
SELECT o.id, o.ot_number
  FROM public.ots o
  JOIN public.clients c ON c.id = o.client_id
 WHERE lower(btrim(o.client_name)) <> lower(btrim(c.name));

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM ot_conflicto;
  IF n <> 5 THEN
    RAISE EXCEPTION 'Se esperaban 5 OT en conflicto y se encontraron %. Se aborta.', n;
  END IF;
END $$;

-- Documentos comerciales primero: cuelgan de la OT.
DELETE FROM public.sales_invoices  WHERE ot_id IN (SELECT id FROM ot_conflicto);
DELETE FROM public.dispatch_guides WHERE ot_id IN (SELECT id FROM ot_conflicto);
DELETE FROM public.ot_cost_lines   WHERE ot_id IN (SELECT id FROM ot_conflicto);
DELETE FROM public.ot_financials   WHERE ot_id IN (SELECT id FROM ot_conflicto);
DELETE FROM public.ot_real_costs   WHERE ot_id IN (SELECT id FROM ot_conflicto);
DELETE FROM public.ots             WHERE id    IN (SELECT id FROM ot_conflicto);

COMMIT;
