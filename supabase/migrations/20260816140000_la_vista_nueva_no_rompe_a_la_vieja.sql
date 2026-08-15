-- La vista nueva no rompe a la vieja
--
-- `/api/purchases` pasó a servir `oc_conciliacion`, que nombra las columnas
-- distinto —`facturado` en vez de `invoiced_total`, `brecha_facturacion` en vez
-- de `variance`—. La pantalla de Compras existente lee los nombres viejos y
-- habría empezado a mostrar celdas vacías sin un solo error en consola.
--
-- Los alias no son deuda: son el contrato anterior sostenido mientras la
-- pantalla migra. Cambiar el nombre de una columna y la pantalla que la lee en
-- el mismo movimiento es cómo se rompen las cosas en producción.

BEGIN;

-- `CREATE OR REPLACE VIEW` sólo sabe AGREGAR columnas al final: intercalar una
-- corre las posiciones y Postgres lo rechaza (42P16). La vista es de hoy y no
-- cuelga nada de ella, así que se recrea entera.
DROP VIEW IF EXISTS public.oc_conciliacion;

CREATE VIEW public.oc_conciliacion AS
SELECT
  p.id,
  p.oc_number,
  p.status,
  p.supplier,
  p.supplier_rut,
  p.ot_id,
  o.ot_number,
  p.issued_at,
  p.created_at,
  p.expected_date,
  p.purchase_date,
  p.notes,
  p.total_cost                                                     AS pedido,
  COALESCE(rec.recibido_valorizado, 0)                             AS recibido,
  COALESCE(inv.facturado, 0)                                       AS facturado,
  COALESCE(p.total_cost, 0) - COALESCE(rec.recibido_valorizado, 0) AS brecha_recepcion,
  COALESCE(rec.recibido_valorizado, 0) - COALESCE(inv.facturado, 0) AS brecha_facturacion,
  COALESCE(rec.lotes, 0)                                           AS lotes,
  COALESCE(rec.certificados_vencidos, 0)                           AS certificados_vencidos,
  -- ── Contrato anterior ────────────────────────────────────────────────────
  p.total_cost                                                     AS total_cost,
  COALESCE(inv.facturado, 0)                                       AS invoiced_total,
  COALESCE(inv.cantidad_facturas, 0)                               AS invoice_count,
  COALESCE(inv.conciliadas, 0)                                     AS matched_count,
  COALESCE(p.total_cost, 0) - COALESCE(inv.facturado, 0)           AS variance
FROM public.purchases p
LEFT JOIN public.ots o ON o.id = p.ot_id
LEFT JOIN LATERAL (
  SELECT
    SUM(l.quantity_received * COALESCE(l.unit_cost, 0)) AS recibido_valorizado,
    COUNT(*)                                            AS lotes,
    COUNT(*) FILTER (
      WHERE l.certification_expires_on IS NOT NULL
        AND l.certification_expires_on < CURRENT_DATE
    )                                                   AS certificados_vencidos
  FROM public.inventory_lots l
  WHERE l.purchase_id = p.id
) rec ON TRUE
LEFT JOIN LATERAL (
  SELECT
    SUM(i.amount)                                         AS facturado,
    COUNT(*)                                              AS cantidad_facturas,
    COUNT(*) FILTER (WHERE i.status IN ('matched', 'paid')) AS conciliadas
  FROM public.purchase_invoices i
  WHERE i.purchase_id = p.id
) inv ON TRUE;

COMMENT ON VIEW public.oc_conciliacion IS
  'Calce a tres bandas: pedido / recibido / facturado, con las dos brechas separadas — bodega y cuentas por pagar son problemas distintos. Mantiene los alias del contrato anterior de oc_billing.';

COMMIT;
