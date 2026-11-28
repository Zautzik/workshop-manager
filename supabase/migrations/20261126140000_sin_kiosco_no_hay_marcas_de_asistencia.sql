-- Sin kiosco no hay marcas de asistencia (2026-11-26, aprobado por el dueño).
--
-- El kiosco /estacion se sacó el 2026-11-25: el registro legal de asistencia no
-- pasa por la app, y la mano de obra sale de Planta (labor-from-shifts.ts), no
-- de marcas de reloj. `attendance_events` quedó sin nadie que la escriba ni la
-- lea — y con 442 marcas de entrada y salida sembradas, datos personales que la
-- política de privacidad ya no declara (minimización, Ley 21.719).
--
-- Verificado antes de borrarla: ninguna FK apunta a la tabla, no tiene
-- disparadores, ninguna vista ni función la nombra y no está en la publicación
-- de realtime. Respaldo de las 442 filas en backups/2026-11-26_attendance_events.json.

drop table if exists public.attendance_events;
