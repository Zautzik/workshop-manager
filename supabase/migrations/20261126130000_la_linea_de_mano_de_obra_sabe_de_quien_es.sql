-- La línea de mano de obra sabe de quién es (2026-11-26).
--
-- stage-valuation.ts escribe una línea de `ot_cost_lines` por persona y por
-- pasada, pero la persona sólo quedaba en el texto: «Mano de obra — Ana Soto
-- (2 h, turno Mañana 2026-11-12)». Las horas por persona (Consola) y la gente
-- por OT (Mano de obra) se reconstruían leyendo ese nombre y buscándolo en
-- employees.full_name: funciona mientras no haya dos personas con el mismo
-- nombre, y se rompe en silencio el día que entren, o si alguien se cambia el
-- nombre en su ficha.
--
-- Desde ahora la línea guarda employee_id. El texto queda para leerlo una
-- persona; la identidad la lleva la columna.
--
-- Relleno de lo que ya existe: el nombre del texto contra employees, SÓLO si
-- ese nombre es de una única persona. Un nombre repetido o que ya no existe
-- queda en NULL — no se adivina a quién cargarle horas ajenas.

alter table public.ot_cost_lines
  add column if not exists employee_id uuid references public.employees(id) on delete set null;

comment on column public.ot_cost_lines.employee_id is
  'Persona a la que corresponde una línea de mano de obra (category = labor). NULL en líneas que no son de una persona.';

create index if not exists ot_cost_lines_employee_id_idx
  on public.ot_cost_lines (employee_id)
  where employee_id is not null;

with unique_names as (
  select full_name, min(id::text)::uuid as id
  from public.employees
  where full_name is not null
  group by full_name
  having count(*) = 1
)
update public.ot_cost_lines l
set employee_id = u.id
from unique_names u
where l.category = 'labor'
  and l.employee_id is null
  and l.description like 'Mano de obra — %'
  and substring(l.description from '^Mano de obra — (.+?) \(') = u.full_name;
