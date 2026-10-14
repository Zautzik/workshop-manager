-- RLS en las doce tablas que nunca lo tuvieron
--
-- La auditoría 2026-10 («the Good, the Bad and the Ugly», §Ugly 1) contó once
-- tablas sin row-level security. Al re-verificar el 2026-10-13 son DOCE: falta
-- `deprecated_worker_fields` en esa lista. Ninguna de las doce tiene tampoco
-- una sola policy.
--
-- Por qué esto importa más de lo que parecía: el repositorio es público y
-- nombra el proyecto, y la documentación de Supabase es explícita —«a table in
-- an exposed schema without RLS is readable and writable by any role with a
-- grant on it»— y además «a new table in public starts with every privilege
-- already granted to all three roles». Es decir: estas doce no están
-- "protegidas porque sólo las lee el servidor". Están abiertas a cualquiera
-- que tenga la publishable key, que viaja en el bundle del navegador.
--
-- Por qué activar RLS acá no rompe nada, y por qué NO se escribe ninguna
-- policy: las doce se leen únicamente por el camino del service-role
-- (`supabaseAdmin`, 183 archivos). Se verificó una por una que ningún archivo
-- que importa `@/integrations/supabase/client` las toque. El service-role
-- pasa por encima de RLS, así que la aplicación no se entera; y para la
-- publishable key, de nuevo la documentación: «once RLS is enabled, no data is
-- accessible through the API when using a publishable key, until you create
-- policies». Esa ausencia de policies ES la medida de seguridad.
--
--   ⚠ Si algún día alguien "arregla" esto agregando una policy permisiva para
--     que una pantalla lea directo desde el navegador, vuelve a abrir el
--     agujero. El camino correcto es una ruta de API con su control de rol.
--
-- Falla ruidosamente si una de las doce no existe: una migración que asume
-- doce tablas y encuentra once tiene un supuesto roto, y saltárselo en
-- silencio es cómo se llega a creer que algo está cerrado cuando no lo está.

BEGIN;

DO $$
DECLARE
  t        text;
  faltan   text[] := '{}';
  activadas int := 0;
  objetivo CONSTANT text[] := ARRAY[
    'clients',
    'dies',
    'ot_templates',
    'ot_drafts',
    'ot_attachments',
    'ot_approvals',
    'purchase_items',
    'attendance_events',
    'certification_requirements',
    'ot_requirements',
    'inventory_reservations',
    'deprecated_worker_fields'
  ];
BEGIN
  FOREACH t IN ARRAY objetivo
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      activadas := activadas + 1;
    ELSE
      faltan := faltan || t;
    END IF;
  END LOOP;

  IF array_length(faltan, 1) > 0 THEN
    RAISE EXCEPTION
      'Esta migración esperaba 12 tablas y no encontró: %. Revisar antes de seguir.',
      array_to_string(faltan, ', ');
  END IF;

  RAISE NOTICE 'RLS activado en % tablas (sin policies, a propósito).', activadas;
END $$;

-- Deja constancia en el catálogo de por qué no hay policies, para quien venga
-- a mirar con \d+ en vez de leer este archivo.
COMMENT ON TABLE public.clients IS
  'RLS activo y sin policies a propósito (20261014120000): se lee sólo por service-role desde rutas de API.';
COMMENT ON TABLE public.ot_approvals IS
  'RLS activo y sin policies a propósito (20261014120000): se lee sólo por service-role desde rutas de API.';
-- `attendance_events` ya tenía comentario desde 20260621130000 — se conserva su
-- texto y se le agrega la nota. Esa misma migración dejó escrito «NOTE: enable
-- RLS to match your posture»; esto es ese pendiente, cerrado.
COMMENT ON TABLE public.attendance_events IS
  'Station badge-in/out clock events — attendance heartbeat + capture attribution. '
  'RLS activo y sin policies a propósito (20261014120000): dato personal, sólo service-role.';

COMMIT;
