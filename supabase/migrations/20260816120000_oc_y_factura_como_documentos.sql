-- La OC y la factura como documentos, no como formularios
--
-- Las tablas existen desde junio y funcionan. Lo que les falta es lo que separa
-- un registro de un DOCUMENTO, que son cuatro propiedades:
--
--   inmutable   · una vez emitida no se edita; se anula o se corrige aparte
--   correlativa · numeración sin huecos, asignada por la base
--   atribuida   · quién emitió, quién recibió, quién facturó, con reloj propio
--   conciliada  · pedido ↔ recibido ↔ facturado, con la diferencia a la vista
--
-- ── Los dos defectos que esto corrige ───────────────────────────────────────
--
-- 1. EL NÚMERO SE QUEMABA AL CREAR. `oc_number` tenía `DEFAULT nextval(...)`,
--    así que un borrador abandonado consumía un correlativo para siempre. Los
--    huecos en una numeración son la primera pregunta de una auditoría, y la
--    respuesta «se nos borró un borrador» no sirve. Ahora el número nace al
--    EMITIR: mientras es borrador, la OC no tiene número porque todavía no es
--    un documento.
--
-- 2. LA CONCILIACIÓN ERA A DOS BANDAS. `oc_billing` calcula
--    `variance = pedido - facturado` y nunca mira lo que efectivamente llegó.
--    Entre esas dos cifras se pierde plata en silencio: llegan 480 pliegos de
--    500 y facturan 500. La vista nueva compara las tres.

BEGIN;

-- ─── 1 · Atribución ─────────────────────────────────────────────────────────
--
-- Quién pide, quién recibe y quién factura son tres personas distintas en un
-- taller que funciona. No es burocracia: que el que pide no sea el que recibe
-- es control interno básico.
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS issued_by     UUID,
  ADD COLUMN IF NOT EXISTS issued_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by     UUID,
  ADD COLUMN IF NOT EXISTS voided_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_reason TEXT;

-- Lo que ya existe: se rellena la hora con la de creación, que es lo más
-- cercano a la verdad que hay. El AUTOR no se inventa — no se puede saber
-- retroactivamente quién emitió una OC de junio, y poner a cualquiera sería
-- exactamente el `signed_by_name: 'Cliente'` de esta historia.
UPDATE purchases
   SET issued_at = COALESCE(issued_at, purchase_date::timestamptz, created_at)
 WHERE status <> 'draft' AND issued_at IS NULL;

-- ── Por qué NOT VALID ───────────────────────────────────────────────────────
--
-- Un CHECK normal se evalúa contra TODAS las filas y la migración abortaría:
-- las OC anteriores no tienen autor y nunca lo van a tener. `NOT VALID` deja
-- pasar lo viejo y exige lo nuevo — que es la única lectura honesta. Las filas
-- históricas quedan reconocibles justamente por tener `issued_by` nulo.
DO $$ BEGIN
  ALTER TABLE purchases ADD CONSTRAINT purchases_anular_exige_motivo
    CHECK (status <> 'cancelled' OR (voided_reason IS NOT NULL AND btrim(voided_reason) <> ''))
    NOT VALID;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- Una OC emitida tiene número, autor y hora. Las tres o ninguna.
DO $$ BEGIN
  ALTER TABLE purchases ADD CONSTRAINT purchases_emitida_esta_completa
    CHECK (
      status = 'draft'
      OR (oc_number IS NOT NULL AND issued_by IS NOT NULL AND issued_at IS NOT NULL)
    )
    NOT VALID;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- ─── 2 · El número nace al emitir ───────────────────────────────────────────
ALTER TABLE purchases ALTER COLUMN oc_number DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.emitir_oc(
  p_purchase_id UUID,
  p_issued_by   UUID
)
RETURNS public.purchases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oc     public.purchases%ROWTYPE;
  v_lineas INTEGER;
BEGIN
  SELECT * INTO v_oc FROM purchases WHERE id = p_purchase_id FOR UPDATE;
  IF v_oc.id IS NULL THEN
    RAISE EXCEPTION 'OC no encontrada.';
  END IF;
  IF v_oc.status <> 'draft' THEN
    RAISE EXCEPTION 'La OC % ya fue emitida y no se puede emitir de nuevo.',
      COALESCE(v_oc.oc_number, v_oc.id::text);
  END IF;

  -- Una OC sin líneas no compromete nada y no debería gastar un correlativo.
  SELECT count(*) INTO v_lineas FROM purchase_items WHERE purchase_id = p_purchase_id;
  IF v_lineas = 0 THEN
    RAISE EXCEPTION 'La OC no tiene líneas: no hay nada que pedir.';
  END IF;

  -- El número lo asigna la base dentro de la transacción. Si lo calculara la
  -- aplicación, dos pestañas abiertas emitirían el mismo.
  UPDATE purchases
     SET oc_number  = 'OC-' || lpad(nextval('public.oc_number_seq')::text, 5, '0'),
         status     = 'sent',
         issued_by  = p_issued_by,
         issued_at  = now(),
         updated_at = now()
   WHERE id = p_purchase_id
   RETURNING * INTO v_oc;

  RETURN v_oc;
END;
$$;

COMMENT ON FUNCTION public.emitir_oc IS
  'Emite una OC: le asigna el correlativo, la firma y la cierra a edición. Un borrador no gasta número.';

-- ─── 3 · Inmutable después de emitida ───────────────────────────────────────
--
-- Un documento que se puede editar no es un documento. Esto vive en la base y
-- no sólo en la API porque una evidencia que se puede romper por otra vía —un
-- script, la consola de Supabase— no es evidencia.
CREATE OR REPLACE FUNCTION public.oc_emitida_no_se_edita()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN NEW;   -- un borrador se edita libremente: para eso es borrador
  END IF;

  -- Anular es una salida legítima, y lo único que cambia son sus propias marcas.
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Lo económico y la identidad del documento quedan congelados. El avance de
  -- estado (recibida, facturada, cerrada) sí puede seguir.
  IF NEW.oc_number    IS DISTINCT FROM OLD.oc_number
  OR NEW.total_cost   IS DISTINCT FROM OLD.total_cost
  OR NEW.supplier     IS DISTINCT FROM OLD.supplier
  OR NEW.supplier_rut IS DISTINCT FROM OLD.supplier_rut
  OR NEW.ot_id        IS DISTINCT FROM OLD.ot_id
  OR NEW.issued_by    IS DISTINCT FROM OLD.issued_by
  OR NEW.issued_at    IS DISTINCT FROM OLD.issued_at THEN
    RAISE EXCEPTION
      'La OC % ya fue emitida: no se puede cambiar proveedor, montos ni numeración. Anulala y emití una nueva.',
      OLD.oc_number;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_oc_emitida_no_se_edita ON purchases;
CREATE TRIGGER trg_oc_emitida_no_se_edita
  BEFORE UPDATE ON purchases
  FOR EACH ROW EXECUTE FUNCTION public.oc_emitida_no_se_edita();

-- Las líneas de una OC emitida tampoco se tocan: cambiar una cantidad después
-- de emitir es cambiar el documento por la puerta de atrás.
CREATE OR REPLACE FUNCTION public.lineas_de_oc_emitida_no_se_editan()
RETURNS TRIGGER AS $$
DECLARE
  v_status TEXT;
  v_oc     TEXT;
BEGIN
  SELECT status, oc_number INTO v_status, v_oc
    FROM purchases
   WHERE id = COALESCE(NEW.purchase_id, OLD.purchase_id);

  IF v_status IS NOT NULL AND v_status <> 'draft' THEN
    -- Recibir escribe `lot_id` en la línea, y eso es parte del flujo normal.
    IF TG_OP = 'UPDATE'
       AND NEW.quantity  IS NOT DISTINCT FROM OLD.quantity
       AND NEW.unit_cost IS NOT DISTINCT FROM OLD.unit_cost
       AND NEW.item_id   IS NOT DISTINCT FROM OLD.item_id THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'La OC % ya fue emitida: sus líneas no se modifican.', COALESCE(v_oc, '(sin número)');
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lineas_oc_emitida ON purchase_items;
CREATE TRIGGER trg_lineas_oc_emitida
  BEFORE INSERT OR UPDATE OR DELETE ON purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.lineas_de_oc_emitida_no_se_editan();

-- ─── 4 · La recepción es un hecho con dueño ─────────────────────────────────
ALTER TABLE inventory_lots
  ADD COLUMN IF NOT EXISTS received_by      UUID,
  ADD COLUMN IF NOT EXISTS variance_reason  TEXT,
  -- Recibir material con certificado vencido es una desviación: se puede
  -- autorizar, pero tiene que quedar escrito quién y por qué.
  ADD COLUMN IF NOT EXISTS cert_override_by     UUID,
  ADD COLUMN IF NOT EXISTS cert_override_reason TEXT;

COMMENT ON COLUMN inventory_lots.variance_reason IS
  'Por qué llegó distinto de lo pedido. La diferencia entre pedido y recibido es donde se pierde plata en silencio.';
COMMENT ON COLUMN inventory_lots.cert_override_reason IS
  'FSSC 22000: recibir con certificado vencido exige autorización nominal. Sin esto, el campo de vencimiento es decorativo.';

-- ─── 5 · La factura, con su aritmética verificada ───────────────────────────
ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS issuer_rut   TEXT,
  ADD COLUMN IF NOT EXISTS net          NUMERIC(16,2),
  ADD COLUMN IF NOT EXISTS vat          NUMERIC(16,2),
  ADD COLUMN IF NOT EXISTS match_status TEXT,
  ADD COLUMN IF NOT EXISTS match_notes  TEXT,
  ADD COLUMN IF NOT EXISTS recorded_by  UUID;

DO $$ BEGIN
  ALTER TABLE purchase_invoices ADD CONSTRAINT facturas_match_status_valido
    CHECK (match_status IS NULL OR match_status IN ('ok', 'en_revision', 'con_diferencia'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- Neto + IVA tiene que dar el total. Se admite un peso de diferencia por el
-- redondeo del emisor; más que eso es un error de tipeo que hay que atajar en
-- la puerta y no descubrir cuadrando a fin de mes.
DO $$ BEGIN
  ALTER TABLE purchase_invoices ADD CONSTRAINT facturas_cuadran
    CHECK (
      net IS NULL OR vat IS NULL OR amount IS NULL
      OR abs((net + vat) - amount) <= 1
    );
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- Dos facturas con el mismo folio del mismo emisor es un duplicado, y pagar
-- dos veces la misma factura es de los errores más caros y más silenciosos.
-- Sólo aplica a las que tengan RUT del emisor, que es una columna nueva: las
-- facturas históricas no lo tienen y quedan fuera del índice sin bloquear la
-- migración. Desde ahora, un folio repetido del mismo emisor no entra.
CREATE UNIQUE INDEX IF NOT EXISTS idx_facturas_folio_por_emisor
  ON purchase_invoices (issuer_rut, invoice_number)
  WHERE issuer_rut IS NOT NULL AND invoice_number IS NOT NULL;

-- ─── 6 · La conciliación, a tres bandas ─────────────────────────────────────
--
-- `oc_billing` compara pedido contra facturado y se salta lo que llegó. Esta
-- mira las tres cifras, que es la única forma de ver el caso caro: recibir 480
-- y que te facturen 500.
CREATE OR REPLACE VIEW public.oc_conciliacion AS
SELECT
  p.id,
  p.oc_number,
  p.status,
  p.supplier,
  p.supplier_rut,
  p.ot_id,
  o.ot_number,
  p.issued_at,
  p.total_cost                                              AS pedido,
  COALESCE(rec.recibido_valorizado, 0)                      AS recibido,
  COALESCE(inv.facturado, 0)                                AS facturado,
  -- Las dos brechas que importan, separadas: una es un problema de bodega y la
  -- otra un problema de cuentas por pagar. Sumarlas las esconde.
  COALESCE(p.total_cost, 0) - COALESCE(rec.recibido_valorizado, 0) AS brecha_recepcion,
  COALESCE(rec.recibido_valorizado, 0) - COALESCE(inv.facturado, 0) AS brecha_facturacion,
  rec.lotes,
  rec.certificados_vencidos,
  COALESCE(inv.cantidad_facturas, 0)                        AS cantidad_facturas
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
  SELECT SUM(i.amount) AS facturado, COUNT(*) AS cantidad_facturas
  FROM public.purchase_invoices i
  WHERE i.purchase_id = p.id
) inv ON TRUE;

COMMENT ON VIEW public.oc_conciliacion IS
  'Calce a tres bandas: pedido / recibido / facturado, con las dos brechas separadas — bodega y cuentas por pagar son problemas distintos.';

-- ─── 7 · Recibir verifica el certificado ────────────────────────────────────
--
-- `receive_oc_into_lot` aceptaba `cert_expires` y lo guardaba sin mirarlo. Un
-- campo de vencimiento que no bloquea nada es decoración: para FSSC 22000 lo
-- que importa no es haber anotado la fecha, es que material sin certificado
-- vigente NO ENTRE a producción.
--
-- No se prohíbe absolutamente —a veces el certificado llega con dos días de
-- atraso y el trabajo no espera— pero pasar igual exige autorización nominal.
-- Esa es la diferencia entre un control y un cartel.
-- `CREATE OR REPLACE` con otra cantidad de parámetros NO reemplaza: crea una
-- SOBRECARGA. Quedarían las dos versiones y toda llamada de siete argumentos
-- sería ambigua — un error que sólo aparece en ejecución, con la bodega parada.
--
-- Se borran TODAS las firmas por nombre y no una firma adivinada: la función se
-- redefinió más de una vez desde junio y escribir la lista a mano deja viva la
-- que uno no recordaba.
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS firma
      FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = 'receive_oc_into_lot'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', f.firma);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.receive_oc_into_lot(
  p_purchase_id  UUID,
  p_item_id      UUID,
  p_quantity     NUMERIC,
  p_unit_cost    NUMERIC DEFAULT NULL,
  p_lot_number   TEXT    DEFAULT NULL,
  p_cert_code    TEXT    DEFAULT NULL,
  p_cert_expires DATE    DEFAULT NULL,
  p_received_by  UUID    DEFAULT NULL,
  p_variance_reason        TEXT DEFAULT NULL,
  p_cert_override_reason   TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p          public.purchases%ROWTYPE;
  v_lot_id     UUID;
  v_lot_number TEXT;
BEGIN
  SELECT * INTO v_p FROM public.purchases WHERE id = p_purchase_id;
  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'OC no encontrada: %', p_purchase_id;
  END IF;

  -- No se recibe contra un borrador: si no se emitió, no se pidió.
  IF v_p.status = 'draft' THEN
    RAISE EXCEPTION 'La OC todavía es un borrador: emitila antes de recibir.';
  END IF;
  IF v_p.status = 'cancelled' THEN
    RAISE EXCEPTION 'La OC % está anulada.', v_p.oc_number;
  END IF;

  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'Debe indicar el material recibido.';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Cantidad recibida inválida.';
  END IF;

  -- El control que convierte el campo en barrera.
  IF p_cert_expires IS NOT NULL
     AND p_cert_expires < CURRENT_DATE
     AND COALESCE(btrim(p_cert_override_reason), '') = '' THEN
    RAISE EXCEPTION
      'El certificado del lote venció el % y no puede entrar a producción sin autorización escrita.',
      to_char(p_cert_expires, 'DD-MM-YYYY');
  END IF;

  v_lot_number := COALESCE(NULLIF(p_lot_number, ''),
                           COALESCE(v_p.oc_number, 'OC') || '-L' || to_char(now(), 'HH24MISS'));

  INSERT INTO public.inventory_lots (
    item_id, lot_number, purchase_id, supplier_name, received_date,
    unit_cost, quantity_received, quantity_available,
    certification_code, certification_expires_on,
    received_by, variance_reason, cert_override_by, cert_override_reason
  ) VALUES (
    p_item_id, v_lot_number, p_purchase_id, v_p.supplier, CURRENT_DATE,
    COALESCE(p_unit_cost, 0), p_quantity, 0,
    p_cert_code, p_cert_expires,
    p_received_by,
    NULLIF(btrim(COALESCE(p_variance_reason, '')), ''),
    CASE WHEN COALESCE(btrim(p_cert_override_reason), '') <> '' THEN p_received_by END,
    NULLIF(btrim(COALESCE(p_cert_override_reason, '')), '')
  )
  RETURNING id INTO v_lot_id;

  -- El movimiento de inventario: un solo escritor de la disponibilidad, para
  -- que el saldo y el libro nunca discrepen.
  INSERT INTO public.inventory_stock_transactions (
    item_id, lot_id, tx_type, quantity, unit_cost, reference_code, notes
  ) VALUES (
    p_item_id, v_lot_id, 'purchase', p_quantity, COALESCE(p_unit_cost, 0),
    v_p.oc_number, 'Recepción de ' || COALESCE(v_p.oc_number, 'OC')
  );

  UPDATE public.purchase_items
     SET lot_id = v_lot_id
   WHERE purchase_id = p_purchase_id
     AND item_id = p_item_id
     AND lot_id IS NULL;

  -- La OC avanza sola cuando llega material: el estado sigue al hecho físico.
  UPDATE public.purchases
     SET status = 'received', updated_at = now()
   WHERE id = p_purchase_id
     AND status = 'sent';

  -- Mantiene la línea del libro de compras alineada con la OC. Estaba en la
  -- versión anterior y perderla habría desalineado el costeo en silencio.
  PERFORM public.sync_purchase_ledger(p_purchase_id);

  RETURN v_lot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_oc_into_lot(
  UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT, DATE, UUID, TEXT, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.emitir_oc(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.receive_oc_into_lot IS
  'Recibe contra una OC emitida: crea el lote con su certificado, bloquea si venció salvo autorización nominal, y mueve el inventario.';

COMMIT;
