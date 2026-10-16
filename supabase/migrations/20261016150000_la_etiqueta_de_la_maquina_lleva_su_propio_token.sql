-- La etiqueta de la máquina lleva su propio token
--
-- El QR pegado en la máquina apuntaba a `/equipos/lectura/<machine_id>`, una
-- pantalla detrás de `ProtectedRoute`. El operario que escanea desde el teléfono
-- en el taller termina en /login, que es exactamente donde no sirve de nada.
--
-- Decisión del dueño (2026-10-16): el QR no tiene que pedir sesión, y su única
-- función es actualizar las mantenciones pendientes de esa máquina.
--
-- ── Por qué un token y no el id de la máquina ──────────────────────────────
--
-- Porque una URL pública es una credencial. Si la URL fuera
-- `/m/<machine_id>`, cualquiera que viera un id de máquina en otra parte
-- —un log, una captura, otra pantalla— podría cerrar órdenes de mantención de
-- esa máquina. Y los ids de máquina aparecen en varias rutas de la aplicación.
--
-- Con un token aparte, lo único que abre la puerta es la etiqueta física pegada
-- en la máquina. Es el mismo patrón que `ots.share_token` para el portal del
-- cliente (20260717120000), que ya resolvió este problema en este repositorio:
-- «Public tracker token. Regenerate to revoke shared links. Never expose the
-- primary key instead.»
--
-- ── Lo que esto NO resuelve, y hay que decirlo ─────────────────────────────
--
-- Quien le saque una foto a la etiqueta puede, desde cualquier parte, marcar
-- ítems y cerrar las órdenes de ESA máquina. Son registros de mantención, que
-- bajo FSSC 22000 son evidencia. El token limita el alcance a una máquina y
-- permite revocar sin tocar nada más —se regenera y se reimprime la etiqueta—
-- pero no sustituye a una persona identificada.
--
-- Si eso no alcanza, el paso siguiente es el patrón del kiosco: leer la
-- credencial del operario (`employees.badge_code`) antes de permitir la
-- escritura, como hace `/api/attendance/clock`. Queda anotado, no implementado:
-- el pedido fue «que no necesiten login».

BEGIN;

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS qr_token UUID NOT NULL DEFAULT gen_random_uuid();

-- Único: el token ES la identificación de la máquina en la ruta pública.
CREATE UNIQUE INDEX IF NOT EXISTS machines_qr_token_idx
  ON public.machines (qr_token);

COMMENT ON COLUMN public.machines.qr_token IS
  'Token de la etiqueta QR pegada en la maquina (/m/<token>). Es una credencial: abre la pantalla publica de mantenciones pendientes de ESTA maquina, sin sesion. Regenerar y reimprimir la etiqueta para revocar. Nunca usar el id de la maquina en su lugar.';

COMMIT;
