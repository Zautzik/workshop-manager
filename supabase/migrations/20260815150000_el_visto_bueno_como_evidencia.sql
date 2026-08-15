-- El visto bueno como evidencia
--
-- `ot_approvals` existe desde marzo con 0 filas. Mientras tanto la aprobación
-- se guardaba en `vistos_buenos.signed_by_name` con la cadena literal
-- 'Cliente'. El único propósito de un visto bueno es trasladar la
-- responsabilidad —si el cliente aprobó una errata, la reimpresión es suya— y
-- «Cliente» no sostiene eso frente a un reclamo: no dice quién, no dice qué
-- versión, no dice desde dónde.
--
-- Reparto: `vistos_buenos` es el DOCUMENTO (qué se cotizó, qué se probó, el
-- PDF). `ot_approvals` es el REGISTRO DE DECISIONES, una fila por vuelta. Los
-- `signed_*` del documento no se van, pero dejan de escribirse a mano: los
-- llena un disparador desde la decisión. Una sola puerta para decidir.
--
-- ── Quién responde ──────────────────────────────────────────────────────────
--
-- El cliente NO entra al sistema: quien marca el trabajo como aprobado es el
-- vendedor, que fue el que habló con él. Eso cambia dónde está la evidencia.
-- No es la firma del cliente —que no existe—: es qué vendedor puso la cara,
-- cuándo, y por qué medio dice que se lo confirmaron. `recorded_by` es la
-- columna que sostiene el registro, y no puede ser nula en una fila decidida.
-- El nombre del contacto del cliente se guarda si se sabe, y muchas veces sólo
-- se sabe «me dijo que sí por teléfono» — eso también es un dato.

BEGIN;

ALTER TABLE ot_approvals
  ADD COLUMN IF NOT EXISTS decision       TEXT,
  ADD COLUMN IF NOT EXISTS reject_reason  TEXT,
  ADD COLUMN IF NOT EXISTS proofed_on     TEXT,
  ADD COLUMN IF NOT EXISTS file_sha256    TEXT,
  ADD COLUMN IF NOT EXISTS approver_name  TEXT,
  ADD COLUMN IF NOT EXISTS approver_email TEXT,
  ADD COLUMN IF NOT EXISTS approver_role  TEXT,
  ADD COLUMN IF NOT EXISTS decided_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_ip      INET,
  ADD COLUMN IF NOT EXISTS round          INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recorded_by    UUID,
  ADD COLUMN IF NOT EXISTS confirmed_via  TEXT,
  ADD COLUMN IF NOT EXISTS vb_id          UUID REFERENCES vistos_buenos(id) ON DELETE SET NULL;

-- Las reglas viven en la base y no sólo en la API, porque una evidencia que se
-- puede escribir mal por otra vía no es evidencia.
DO $$ BEGIN
  ALTER TABLE ot_approvals ADD CONSTRAINT ot_approvals_decision_valida
    CHECK (decision IS NULL OR decision IN ('approved', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ot_approvals ADD CONSTRAINT ot_approvals_motivo_valido
    CHECK (reject_reason IS NULL OR reject_reason IN ('texto', 'color', 'estructura', 'otro'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Aprobar color en una pantalla no es aprobar color. Si lo que se mandó fue un
-- PDF, lo aprobado no incluye el color — y eso es exactamente lo que se
-- discute en la entrega, así que queda registrado contra qué se aprobó.
DO $$ BEGIN
  ALTER TABLE ot_approvals ADD CONSTRAINT ot_approvals_contra_que_valido
    CHECK (proofed_on IS NULL OR proofed_on IN ('pdf', 'prueba_fisica', 'maqueta'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Por qué medio lo confirmó el cliente. Es lo que el vendedor sí sabe y lo que
-- se puede ir a buscar después: un correo se recupera, un «me dijo que sí» no.
DO $$ BEGIN
  ALTER TABLE ot_approvals ADD CONSTRAINT ot_approvals_medio_valido
    CHECK (confirmed_via IS NULL OR confirmed_via IN ('correo', 'whatsapp', 'telefono', 'presencial', 'portal'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Una fila decidida sin responsable ni reloj es una afirmación, no un registro.
-- El responsable es el VENDEDOR que la marcó, no el cliente: el cliente no
-- tiene cuenta y su nombre es, como mucho, un dato que el vendedor transcribe.
DO $$ BEGIN
  ALTER TABLE ot_approvals ADD CONSTRAINT ot_approvals_decidida_tiene_quien_y_cuando
    CHECK (
      decision IS NULL
      OR (recorded_by IS NOT NULL AND decided_at IS NOT NULL AND confirmed_via IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- El rechazo tiene que decir por qué: es lo que decide a quién le rebota el
-- trabajo — a diseño, a prensa o a troquelado. El sí es un sí y no necesita más.
DO $$ BEGIN
  ALTER TABLE ot_approvals ADD CONSTRAINT ot_approvals_rechazo_dice_por_que
    CHECK (decision IS DISTINCT FROM 'rejected' OR reject_reason IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- El nombre del contacto es opcional, pero si se escribe tiene que ser un
-- nombre. La base rechaza el marcador que hizo inútil al registro anterior: si
-- alguien vuelve a poner 'Cliente' como firmante, no entra.
DO $$ BEGIN
  ALTER TABLE ot_approvals ADD CONSTRAINT ot_approvals_nombre_no_es_marcador
    CHECK (
      approver_name IS NULL
      OR lower(btrim(approver_name)) NOT IN ('cliente', 'client', 'el cliente', 'n/a', '-')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Una decisión por vuelta. Dos filas para la vuelta 2 significa que alguien
-- aprobó dos veces la misma prueba, y entonces no se sabe cuál vale.
DO $$ BEGIN
  ALTER TABLE ot_approvals ADD CONSTRAINT ot_approvals_una_por_vuelta
    UNIQUE (ot_id, round);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_ot_approvals_decision
  ON ot_approvals (ot_id, decision) WHERE decision IS NOT NULL;

COMMENT ON COLUMN ot_approvals.file_sha256 IS
  'Huella del archivo exacto que se aprobó. Sin esto, «nos aprobaron otra versión» es indefendible.';
COMMENT ON COLUMN ot_approvals.decided_at IS
  'Reloj del SERVIDOR, no el del navegador de quien marca.';
COMMENT ON COLUMN ot_approvals.recorded_by IS
  'El vendedor que marcó la decisión. Es el responsable del registro: el cliente no entra al sistema.';
COMMENT ON COLUMN ot_approvals.confirmed_via IS
  'Por qué medio lo confirmó el cliente. Un correo se puede ir a buscar; un «me dijo que sí» no.';
COMMENT ON COLUMN ot_approvals.round IS
  'Qué vuelta de prueba fue. Cada vuelta cuesta plata (ver maqueta.ts) y hoy nadie las cuenta.';

-- ─── El documento se entera de la decisión ──────────────────────────────────
--
-- `vistos_buenos.signed_by_name` / `signed_at` / `status` siguen existiendo y
-- los siguen leyendo varias pantallas. Lo que cambia es quién los escribe: ya
-- no la interfaz, sino esto. Así no hay forma de firmar sin dejar evidencia.
CREATE OR REPLACE FUNCTION reflejar_aprobacion_en_visto_bueno()
RETURNS TRIGGER AS $$
DECLARE
  destino UUID;
BEGIN
  IF NEW.decision IS NULL THEN
    RETURN NEW;
  END IF;

  destino := COALESCE(NEW.vb_id, (SELECT vb_id FROM ots WHERE id = NEW.ot_id));
  IF destino IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE vistos_buenos
     -- Si el vendedor no anotó el contacto, el documento queda sin nombre en vez
     -- de inventar uno. Un nulo dice «no se sabe»; 'Cliente' decía «se sabe» y
     -- era mentira.
     SET signed_by_name = NULLIF(btrim(COALESCE(NEW.approver_name, '')), ''),
         signed_at      = NEW.decided_at,
         status         = CASE WHEN NEW.decision = 'approved' THEN 'signed'::vb_status ELSE status END,
         updated_at     = now()
   WHERE id = destino;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reflejar_aprobacion ON ot_approvals;
CREATE TRIGGER trg_reflejar_aprobacion
  AFTER INSERT OR UPDATE OF decision ON ot_approvals
  FOR EACH ROW EXECUTE FUNCTION reflejar_aprobacion_en_visto_bueno();

COMMIT;
