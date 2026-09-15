-- Un proveedor bloqueado no puede recibir una OC nueva
--
-- `supplier_profiles` existe desde julio (categorías, certificaciones PEFC) y
-- `emitir_oc` nunca lo mira: se puede emitir plata comprometida a un proveedor
-- que el taller ya decidió no seguir usando —por calidad, por una disputa, por
-- lo que sea— y la única defensa es que alguien se acuerde de no hacerlo.
--
-- Seguimos el mismo criterio que `cert_expires` en la recepción: no es una
-- pared absoluta, porque a veces el proveedor bloqueado es el único que tiene
-- el material esta semana. Es un bloqueo que exige autorización nominal para
-- saltarse — la diferencia entre un control y un cartel.

BEGIN;

-- ─── 1 · El proveedor tiene un estado ──────────────────────────────────────
ALTER TABLE supplier_profiles
  ADD COLUMN IF NOT EXISTS status             TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status_reason      TEXT,
  ADD COLUMN IF NOT EXISTS status_updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_updated_at  TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE supplier_profiles ADD CONSTRAINT supplier_profiles_status_valido
    CHECK (status IN ('active', 'blocked'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

COMMENT ON COLUMN supplier_profiles.status IS
  'active|blocked. Bloqueado no impide historial ni recepción contra OCs ya emitidas — sólo emitir una OC nueva sin autorización.';
COMMENT ON COLUMN supplier_profiles.status_reason IS
  'Por qué está bloqueado. Se muestra en el error de emitir_oc para que quien intenta emitir sepa qué está pasando.';

-- ─── 2 · La OC recuerda si se saltó el bloqueo ──────────────────────────────
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS supplier_override_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_override_reason TEXT;

COMMENT ON COLUMN purchases.supplier_override_reason IS
  'Si esta OC se emitió pese a un proveedor bloqueado, por qué se autorizó. NULL en el caso normal.';

-- ─── 3 · emitir_oc verifica al proveedor ────────────────────────────────────
--
-- Cambia la firma (nuevo parámetro opcional): se borran las versiones previas
-- por nombre, como ya hace `receive_oc_into_lot`, para no dejar viva una
-- sobrecarga de dos argumentos que sería ambigua en producción.
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS firma
      FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = 'emitir_oc'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', f.firma);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.emitir_oc(
  p_purchase_id             UUID,
  p_issued_by               UUID,
  p_supplier_override_reason TEXT DEFAULT NULL
)
RETURNS public.purchases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oc              public.purchases%ROWTYPE;
  v_lineas          INTEGER;
  v_supplier_status TEXT;
  v_supplier_reason TEXT;
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

  -- El proveedor bloqueado no impide el borrador, impide comprometer plata:
  -- se verifica acá, en el único punto donde eso pasa.
  SELECT status, status_reason INTO v_supplier_status, v_supplier_reason
    FROM public.supplier_profiles
   WHERE supplier_name = v_oc.supplier;

  IF v_supplier_status = 'blocked'
     AND COALESCE(btrim(p_supplier_override_reason), '') = '' THEN
    RAISE EXCEPTION
      'El proveedor % está bloqueado%: no se puede emitir sin autorización.',
      v_oc.supplier,
      CASE WHEN COALESCE(btrim(v_supplier_reason), '') <> ''
           THEN ' (' || v_supplier_reason || ')' ELSE '' END;
  END IF;

  -- El número lo asigna la base dentro de la transacción. Si lo calculara la
  -- aplicación, dos pestañas abiertas emitirían el mismo.
  UPDATE purchases
     SET oc_number  = 'OC-' || lpad(nextval('public.oc_number_seq')::text, 5, '0'),
         status     = 'sent',
         issued_by  = p_issued_by,
         issued_at  = now(),
         supplier_override_by     = CASE WHEN v_supplier_status = 'blocked' THEN p_issued_by END,
         supplier_override_reason = CASE WHEN v_supplier_status = 'blocked'
                                          THEN btrim(p_supplier_override_reason) END,
         updated_at = now()
   WHERE id = p_purchase_id
   RETURNING * INTO v_oc;

  RETURN v_oc;
END;
$$;

GRANT EXECUTE ON FUNCTION public.emitir_oc(UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.emitir_oc IS
  'Emite una OC: le asigna el correlativo, la firma y la cierra a edición. Bloquea si el proveedor está bloqueado, salvo autorización nominal. Un borrador no gasta número.';

COMMIT;
