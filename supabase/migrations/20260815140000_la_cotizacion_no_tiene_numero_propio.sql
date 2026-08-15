-- La cotización deja de tener número propio.
--
-- `vistos_buenos.vb_number` daba a cada cotización una identidad —VB-00008— para
-- un trabajo que YA tiene la suya: el número de OT. Dos identidades para la
-- misma cosa obligan a cruzarlas a mano para seguir un trabajo, y es el patrón
-- que este repositorio lleva meses cerrando: workstations/machines,
-- workers/employees, tres listas de precio del papel.
--
-- Dejó de tener sentido cuando cotizar pasó a CREAR la orden (migración del 15
-- de agosto). Antes la cotización era una cosa aparte que podía existir sin OT y
-- necesitaba cómo llamarse; ahora nace con su orden y la orden trae el número.
--
-- Lo que la fila SIGUE siendo: el documento del presupuesto y de la prueba —
-- `estimate_lines` congelado, `signature_url`, `signed_at`, `signed_by_name`.
-- Eso no se toca. Se retira el número, no el registro.
--
-- ── Qué se destruye ─────────────────────────────────────────────────────────
--
-- La columna y sus valores en todas las filas. Nada la referencia: no hay clave
-- foránea contra ella y el código ya dejó de leerla. La secuencia se retira con
-- ella para que no quede un contador de algo que no existe.

BEGIN;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.vistos_buenos;
  RAISE NOTICE 'Se retira vb_number de % cotizaciones. La fila y su estimado quedan.', n;
END $$;

ALTER TABLE public.vistos_buenos DROP COLUMN IF EXISTS vb_number;
DROP SEQUENCE IF EXISTS public.vb_number_seq;

-- ── Comprobación ────────────────────────────────────────────────────────────
-- Que se haya ido la columna y NO el registro.

DO $verifica$
DECLARE quedan integer; conEstimado integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'vistos_buenos' AND column_name = 'vb_number'
  ) THEN
    RAISE EXCEPTION 'vb_number sigue existiendo. Se aborta.';
  END IF;

  SELECT count(*) INTO quedan FROM public.vistos_buenos;
  SELECT count(*) INTO conEstimado FROM public.vistos_buenos WHERE estimate_lines IS NOT NULL;
  IF quedan = 0 THEN
    RAISE EXCEPTION 'No quedan cotizaciones. Se retiraba el número, no el registro. Se aborta.';
  END IF;

  RAISE NOTICE 'Quedan % cotizaciones, % con su estimado congelado.', quedan, conEstimado;
END $verifica$;

COMMIT;
