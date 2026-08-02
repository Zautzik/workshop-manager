-- Los datos de contacto de la gente dejan de ser legibles por cualquiera.
--
-- La política vigente sobre `employees` es:
--
--     CREATE POLICY "Authenticated users can view employees"
--       ON public.employees FOR SELECT
--       USING (auth.uid() IS NOT NULL);
--
-- Es decir: CUALQUIER usuario con sesión iniciada podía leer la tabla entera,
-- incluidos correo, teléfono, nombre y teléfono del contacto de emergencia,
-- fecha de finiquito y las notas internas de cada compañero. Un `technician`
-- —cuyo único punto de contacto con la app es la captura por WhatsApp— tenía el
-- teléfono de emergencia de los 25.
--
-- Hoy no hay nadie expuesto porque sólo existe una cuenta real, pero eso cambia
-- en el momento en que se creen las cuentas del taller, que es justo lo que
-- viene. Conviene cerrarlo antes y no después.
--
-- RLS filtra FILAS, no columnas, así que aquí la herramienta correcta es el
-- privilegio por columna: se revoca el SELECT global sobre la tabla y se vuelve
-- a conceder únicamente sobre lo que el piso necesita para trabajar. Las rutas
-- de servidor usan `supabaseAdmin`, que no pasa por estos privilegios y sigue
-- sirviendo la ficha completa a quien corresponda tras revisar su rol.

BEGIN;

-- El SELECT amplio se retira; la política de RLS se mantiene tal cual, porque
-- sigue siendo cierta a nivel de fila: un usuario con sesión puede ver a la
-- gente. Lo que cambia es CUÁNTO de cada persona.
REVOKE SELECT ON public.employees FROM authenticated;

-- Lo que el taller necesita para funcionar: saber quién es quién, en qué área
-- está, si sigue vigente, y su desempeño —que es lo que alimenta Planta,
-- Rendimiento y la matriz de competencias.
GRANT SELECT (
  id,
  user_id,
  employee_code,
  full_name,
  department,
  status,
  hire_date,
  sheets_per_hour,
  teamwork_rating,
  overtime_availability,
  attendance_score,
  lateness_minutes,
  quality_score,
  speed_score,
  overall_rating,
  created_at,
  updated_at
) ON public.employees TO authenticated;

-- Fuera del alcance del cliente quedan, y sólo se sirven por ruta de servidor
-- con control de rol:
--   email, phone, emergency_contact_name, emergency_contact_phone,
--   notes, termination_date, badge_code
--
-- `badge_code` va en esa lista a propósito: es la credencial con la que se
-- marca asistencia. Si cualquiera puede leerlo, cualquiera puede marcar por
-- otro, y el registro de horas —que termina en el costo de mano de obra de una
-- OT— deja de significar nada.

COMMIT;
