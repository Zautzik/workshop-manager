-- La pasada puede quedar abierta
--
-- El cierre de etapa nació obligatorio: sin horas, la OT no salía de la
-- máquina. Estaba mal, y el defecto es viejo y conocido — una tarjeta que no se
-- mueve no hace que alguien cargue el dato, hace que el trabajo se mueva por
-- fuera del sistema. El taller sigue andando; lo que se detiene es el registro.
--
-- Y era además incoherente con el resto de la casa: el papel se declara en
-- `/operaciones/escanear`, al lado de la máquina y con guantes puestos; las
-- horas llegan por WhatsApp desde el teléfono del operario. Exigir las dos
-- cosas en el diálogo del tablero le pedía al supervisor datos que otras dos
-- puertas ya saben pedir mejor.
--
-- ── Dónde queda la exigencia ────────────────────────────────────────────────
--
-- No desaparece: se corre al final. Mover una tarjeta nunca se bloquea; TERMINAR
-- una OT sí. Una pasada sin horas queda ABIERTA —`hours IS NULL`— y se ve en la
-- tarjeta; la compuerta que ya pedía costos reales antes de despachar ahora
-- también se niega a cerrar una OT con pasadas abiertas, y las nombra.
--
-- Se recoge exactamente el mismo dato. La diferencia es que puede llegar por
-- cualquier puerta y en cualquier momento, en vez de tener que estar en la mano
-- del que arrastra la tarjeta.
--
-- ── El estado se deduce, no se guarda ───────────────────────────────────────
--
-- `abierta` es `hours IS NULL`. Una columna `estado` al lado de las horas sería
-- un segundo lugar donde dice lo mismo, y en cuanto los dos se puedan escribir
-- por separado, se van a contradecir. El sistema ya tiene siete respuestas a
-- «dónde está esta OT»; no hace falta una octava a «está cerrada esta pasada».

BEGIN;

-- Sin horas la fila igual vale: dice que la OT pasó por acá y que falta el dato.
ALTER TABLE public.ot_stage_reports ALTER COLUMN hours DROP NOT NULL;

-- El CHECK anterior exigía `hours > 0` sin contemplar el nulo. Se reemplaza por
-- el mismo rango, aplicado sólo cuando hay número: cero sigue prohibido —es «no
-- lo medí» disfrazado de medición— pero «todavía no lo sé» ahora se puede decir.
ALTER TABLE public.ot_stage_reports DROP CONSTRAINT IF EXISTS ot_stage_reports_horas_positivas;
ALTER TABLE public.ot_stage_reports DROP CONSTRAINT IF EXISTS ot_stage_reports_horas_creibles;

DO $$ BEGIN
  ALTER TABLE public.ot_stage_reports ADD CONSTRAINT ot_stage_reports_horas_creibles
    CHECK (hours IS NULL OR (hours > 0 AND hours <= 400));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- ── En Entrega también es una pasada ────────────────────────────────────────
--
-- El reparto tiene lo mismo que tiene el troquel: dura, se puede complicar y
-- alguien lo sabe en el momento. «Entregado, 3 horas, el cliente no tenía quien
-- recibiera» es exactamente el mismo parte que manda el prensista, y hasta acá
-- no tenía dónde entrar. Tercerizado sigue afuera: ese reloj es de otro taller.
ALTER TABLE public.ot_stage_reports DROP CONSTRAINT IF EXISTS ot_stage_reports_etapa_es_de_taller;

DO $$ BEGIN
  ALTER TABLE public.ot_stage_reports ADD CONSTRAINT ot_stage_reports_etapa_se_cierra
    CHECK (workflow_step IN (
      'guillotine_first_cut', 'offset_printing', 'digital_printing',
      'die_cutting', 'guillotine_final_cut', 'workshop', 'workshop_revision',
      'in_delivery'
    ));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- La compuerta de término pregunta una sola cosa —¿queda alguna abierta?— y la
-- pregunta en cada intento de despachar. El índice parcial es chico porque las
-- abiertas son pocas por definición: son las que alguien todavía debe cerrar.
CREATE INDEX IF NOT EXISTS idx_ot_stage_reports_abiertas
  ON public.ot_stage_reports (ot_id) WHERE hours IS NULL;

COMMENT ON COLUMN public.ot_stage_reports.hours IS
  'Horas reales de la pasada. NULL = pasada abierta: la OT pasó por la etapa y el dato todavía no llegó. Puede llegar después por cualquier puerta (tablero, escáner, WhatsApp). Una OT no se despacha con pasadas abiertas.';

COMMIT;
