-- Una evaluación existe sólo si alguien la hizo (auditoría C4, 2026-11-25).
--
-- employees.overall_rating, quality_score, speed_score y teamwork_rating
-- nacían en 75, y attendance_score en 100, NOT NULL. Ninguna parte de la app
-- los calcula; sólo se pueden tipear en la ficha. Resultado: 23 de 43
-- personas mostraban "Rating 75/100" en Consola, Planta las marcaba elegibles
-- para incentivo y el auto-llenado las ordenaba por ese número inventado.
--
-- Desde ahora NULL = "sin evaluar". La app ya lo muestra así y ya no ordena
-- por estas columnas (worker-eligibility.ts ordena por la competencia de la
-- estación).
--
-- Datos: se limpian SOLO las filas que tienen los cinco valores exactamente
-- en su default (75/75/75/75/100) — esa combinación es la marca de "nadie la
-- tocó". Una persona con cualquier valor distinto conserva los cinco tal cual.

alter table public.employees
  alter column overall_rating drop default,
  alter column overall_rating drop not null,
  alter column quality_score drop default,
  alter column quality_score drop not null,
  alter column speed_score drop default,
  alter column speed_score drop not null,
  alter column teamwork_rating drop default,
  alter column teamwork_rating drop not null,
  alter column attendance_score drop default,
  alter column attendance_score drop not null;

update public.employees
set overall_rating = null,
    quality_score = null,
    speed_score = null,
    teamwork_rating = null,
    attendance_score = null
where overall_rating = 75
  and quality_score = 75
  and speed_score = 75
  and teamwork_rating = 75
  and attendance_score = 100;
