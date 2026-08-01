-- P3 · Rentabilidad por cliente: enlazar las OT con la tabla de clientes.
--
-- La columna `ots.client_id` y su FK a `clients` existían desde siempre, y
-- estaban en NULL en las 94 OTs. El cliente se guardaba como texto libre en
-- `ots.client_name`, así que "LabelCorp S.A." y "Labelcorp SA" eran dos
-- clientes distintos para el sistema y la pregunta central del negocio —¿qué
-- cliente me deja plata y cuál me la quita?— era imposible de responder.
--
-- Otra vez el patrón: la estructura estaba construida y nadie la alimentaba.
--
-- QUÉ TAN SUCIO ESTABA. Menos de lo temido. De 94 OTs:
--   · 72 calzan EXACTO con 7 de los 12 clientes ya cargados
--   · 20 son de "LabelCorp S.A.", que no está en la tabla pese a ser el cliente
--     con más trabajos — incluido el más grande, 3.800.000 etiquetas
--   ·  2 son artefactos del smoke test
--
-- No hizo falta ninguna heurística difusa. El calce es por nombre normalizado
-- (minúsculas, sin espacios sobrantes) y nada más: inventar coincidencias
-- aproximadas sobre la facturación de un taller es exactamente el tipo de
-- suposición que no corresponde tomar.

-- ── 1. El cliente que faltaba ───────────────────────────────────────────────
-- Aparece en 20 OT. Que no esté cargado es un olvido, no una señal de que no
-- exista. Se crea con lo único que se sabe con certeza: su nombre.
INSERT INTO public.clients (name, is_active, notes)
SELECT 'LabelCorp S.A.', true,
       'Creado automáticamente al enlazar las OT (P3, auditoría de Analítica 2026-08). Aparecía en 20 órdenes y no estaba en el maestro. Completar RUT, contacto y condiciones de pago.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clients WHERE lower(btrim(name)) = 'labelcorp s.a.'
);

-- ── 2. Enlazar por nombre normalizado ───────────────────────────────────────
UPDATE public.ots o
   SET client_id = c.id
  FROM public.clients c
 WHERE o.client_id IS NULL
   AND o.client_name IS NOT NULL
   AND lower(btrim(o.client_name)) = lower(btrim(c.name));

-- ── 3. Lo que queda sin enlazar, queda ──────────────────────────────────────
-- Las OT del smoke test no se convierten en cliente. Quedan con client_id NULL
-- y la analítica las agrupa aparte, que es la verdad: no son de nadie.

COMMENT ON COLUMN public.ots.client_id IS
  'FK al maestro de clientes. Rellenada por calce exacto de nombre en 2026-08. `client_name` se conserva como el texto que escribió el vendedor; cuando ambos existen, manda client_id.';

-- ── 4. Que no se vuelva a llenar de texto suelto ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ots_client_id ON public.ots (client_id)
  WHERE client_id IS NOT NULL;
