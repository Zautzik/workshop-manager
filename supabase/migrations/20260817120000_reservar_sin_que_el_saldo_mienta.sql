-- Reservar sin que el saldo mienta
--
-- Cuando un requisito se resuelve «sacando de bodega», hoy sólo se ANOTA de qué
-- lote sale. Nada impide que otro vendedor ofrezca el mismo pallet, ni que otra
-- OT lo consuma primero. El que llega segundo se entera al escanear, con el
-- trabajo montado.
--
-- ── Por qué esto no es una columna ──────────────────────────────────────────
--
-- La tentación es agregar `quantity_reserved` a `inventory_lots` y sumar/restar.
-- Ese número se desincroniza el primer día: alguien anula una OT y nadie resta,
-- una reserva queda de un trabajo que se cayó, y el saldo empieza a mentir para
-- el otro lado — papel que existe y el sistema dice que está tomado.
--
-- Las reservas son filas. Lo reservado se CALCULA de ellas, siempre. Es el mismo
-- principio que ya gobierna el stock: el libro manda y el saldo se deriva.
--
-- ── Por qué el vencimiento se evalúa al leer ────────────────────────────────
--
-- Una reserva que nadie libera es peor que no tener reservas: bloquea papel
-- real por un trabajo que murió hace dos meses. Marcarlas vencidas con un
-- proceso periódico significa que el día que ese proceso falle —y va a fallar—
-- el estante queda tomado sin que nadie sepa por qué.
--
-- Acá una reserva vencida deja de contar SOLA, porque la condición vive en la
-- consulta. No hay demonio que se pueda olvidar de correr.

BEGIN;

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id      UUID NOT NULL REFERENCES inventory_lots(id) ON DELETE CASCADE,
  ot_id       UUID NOT NULL REFERENCES ots(id) ON DELETE CASCADE,
  quantity    NUMERIC(14,2) NOT NULL CHECK (quantity > 0),

  -- activa · consumida · liberada. «Vencida» NO es un estado guardado: es una
  -- condición de fecha, justamente para que no dependa de que alguien la marque.
  status      TEXT NOT NULL DEFAULT 'activa',

  -- Hasta cuándo aguanta. Se calcula al reservar contra la fecha de entrega de
  -- la OT: reservar más allá de eso es reservar para un trabajo que ya debería
  -- haber salido.
  expires_at  TIMESTAMPTZ NOT NULL,

  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  released_reason TEXT
);

DO $$ BEGIN
  ALTER TABLE inventory_reservations ADD CONSTRAINT reservas_status_valido
    CHECK (status IN ('activa', 'consumida', 'liberada'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- Liberar exige motivo, igual que anular una OC: una reserva que desaparece sin
-- explicación es indistinguible de un error.
DO $$ BEGIN
  ALTER TABLE inventory_reservations ADD CONSTRAINT reservas_liberar_exige_motivo
    CHECK (status <> 'liberada' OR (released_reason IS NOT NULL AND btrim(released_reason) <> ''));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- Una OT no reserva dos veces el mismo lote: sería contarlo dos veces contra sí
-- misma. Si necesita más, se amplía la que hay.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservas_una_por_ot_y_lote
  ON inventory_reservations (ot_id, lot_id) WHERE status = 'activa';

CREATE INDEX IF NOT EXISTS idx_reservas_lote_activas
  ON inventory_reservations (lot_id) WHERE status = 'activa';

COMMENT ON TABLE inventory_reservations IS
  'Papel comprometido con una OT antes de consumirlo. Lo reservado se calcula de estas filas: nunca hay un contador que se pueda desincronizar.';
COMMENT ON COLUMN inventory_reservations.expires_at IS
  'Se evalúa al LEER. Una reserva vencida deja de contar sola — no hay proceso periódico que se pueda olvidar de correr.';

-- ─── Lo que de verdad hay libre ─────────────────────────────────────────────
CREATE OR REPLACE VIEW public.inventory_lots_disponibilidad AS
SELECT
  l.id,
  l.lot_number,
  l.item_id,
  l.purchase_id,
  l.supplier_name,
  l.received_date,
  l.unit_cost,
  l.quantity_received,
  l.quantity_available,
  l.certification_code,
  l.certification_expires_on,
  l.blocked_reason,
  COALESCE(r.reservado, 0)                             AS reservado,
  -- Lo que alguien puede tomar hoy sin pisarle el papel a otra OT.
  GREATEST(l.quantity_available - COALESCE(r.reservado, 0), 0) AS libre,
  COALESCE(r.reservas, 0)                              AS reservas_activas
FROM public.inventory_lots l
LEFT JOIN LATERAL (
  SELECT SUM(quantity) AS reservado, COUNT(*) AS reservas
    FROM public.inventory_reservations
   WHERE lot_id = l.id
     AND status = 'activa'
     -- La condición que hace innecesario el demonio.
     AND expires_at > now()
) r ON TRUE;

COMMENT ON VIEW public.inventory_lots_disponibilidad IS
  'El saldo con lo reservado descontado. `libre` es lo que se puede prometer; `quantity_available` es lo que físicamente hay.';

-- ─── Reservar ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reservar_lote(
  p_lot_id   UUID,
  p_ot_id    UUID,
  p_quantity NUMERIC,
  p_by       UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
  v_lot     public.inventory_lots%ROWTYPE;
  v_ot      public.ots%ROWTYPE;
  v_libre   NUMERIC;
  v_vence   TIMESTAMPTZ;
  v_id      UUID;
BEGIN
  -- El mismo bloqueo que el consumo: sin esto dos reservas simultáneas leen el
  -- mismo libre y las dos pasan.
  SELECT * INTO v_lot FROM inventory_lots WHERE id = p_lot_id FOR UPDATE;
  IF v_lot.id IS NULL THEN
    RAISE EXCEPTION 'No existe ese lote.';
  END IF;
  IF v_lot.blocked_reason IS NOT NULL THEN
    RAISE EXCEPTION 'El lote % está retenido: %', v_lot.lot_number, v_lot.blocked_reason;
  END IF;

  SELECT * INTO v_ot FROM ots WHERE id = p_ot_id;
  IF v_ot.id IS NULL THEN
    RAISE EXCEPTION 'No existe esa OT.';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida.';
  END IF;

  -- Lo libre EXCLUYENDO lo que esta misma OT ya tenga reservado: ampliar una
  -- reserva propia no debería competir consigo misma.
  SELECT COALESCE(v_lot.quantity_available, 0) - COALESCE(SUM(quantity), 0)
    INTO v_libre
    FROM inventory_reservations
   WHERE lot_id = p_lot_id AND status = 'activa' AND expires_at > now()
     AND ot_id <> p_ot_id;

  IF v_libre < p_quantity THEN
    RAISE EXCEPTION
      'El lote % tiene % libre: el resto está comprometido con otras órdenes.',
      v_lot.lot_number, GREATEST(v_libre, 0);
  END IF;

  -- Vence con la entrega de la OT más una semana de gracia. Reservar más allá
  -- de eso es tomar papel para un trabajo que ya debería haber salido. Piso de
  -- 7 días para las OT sin fecha o con fecha vencida.
  v_vence := GREATEST(
    COALESCE(v_ot.deadline::timestamptz, now()) + INTERVAL '7 days',
    now() + INTERVAL '7 days'
  );

  INSERT INTO inventory_reservations (lot_id, ot_id, quantity, expires_at, created_by)
  VALUES (p_lot_id, p_ot_id, p_quantity, v_vence, p_by)
  ON CONFLICT (ot_id, lot_id) WHERE status = 'activa'
  DO UPDATE SET quantity = EXCLUDED.quantity, expires_at = EXCLUDED.expires_at
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'lot_number', v_lot.lot_number,
    'ot_number', v_ot.ot_number,
    'quantity', p_quantity,
    'expires_at', v_vence
  );
END;
$BODY$;

GRANT EXECUTE ON FUNCTION public.reservar_lote(UUID, UUID, NUMERIC, UUID) TO authenticated;

-- ─── Liberar ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.liberar_reserva(
  p_ot_id   UUID,
  p_lot_id  UUID,
  p_motivo  TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
  v_n INTEGER;
BEGIN
  IF COALESCE(btrim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'Liberar una reserva exige decir por qué.';
  END IF;

  UPDATE inventory_reservations
     SET status = 'liberada', released_at = now(), released_reason = btrim(p_motivo)
   WHERE ot_id = p_ot_id
     AND (p_lot_id IS NULL OR lot_id = p_lot_id)
     AND status = 'activa';

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$BODY$;

GRANT EXECUTE ON FUNCTION public.liberar_reserva(UUID, UUID, TEXT) TO authenticated;

COMMIT;
