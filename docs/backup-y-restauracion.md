# Respaldo y restauración

Qué se respalda, con qué comando, dónde queda, y cómo se prueba que sirve.

| | |
|---|---|
| Escrito | 2026-10-14, como Fase 0 del [plan de remediación](audit-remediation-plan-2026-10-14.md) |
| Estado | **Primer respaldo tomado el 2026-10-15.** Los tres dumps corrieron OK. La restauración de prueba sigue pendiente — ver §3. |
| Por qué existe | La checklist de salida a producción de julio tiene el ítem de respaldo sin marcar. El repositorio no tenía script de dump, prueba de restauración, ni procedimiento para operar con la aplicación caída. |

---

## 1. Antes que nada: qué plan de Supabase

De la [página de precios de Supabase](https://supabase.com/pricing):

| Plan | Respaldo automático | Otras |
|---|---|---|
| Free | **Ninguno.** Además el proyecto se pausa tras una semana sin uso, y el límite es 500 MB | — |
| Pro | Diario, retención 7 días | Point-in-time recovery es un adicional aparte |

**El proyecto está hoy en Free** (confirmado por el dueño el 2026-10-15; el plan es pasar a Pro, pero todavía no). Así que **no existe ningún respaldo automático**: los dumps de abajo son el único respaldo que hay, y hay que correrlos a mano.

Pasar a Pro sigue siendo la compra de mayor valor del plan de remediación — convierte "el último respaldo es de cuando alguien se acordó" en "hay uno de ayer". Y aun en Pro, un respaldo automático que nadie restauró nunca tampoco es un respaldo: §3 no se vuelve opcional.

---

## 2. Tomar el respaldo

`supabase db dump` **no** trae todo en una sola pasada. La referencia del CLI es explícita: por defecto excluye los esquemas administrados por Supabase (`auth`, `storage`, los de extensiones) y «does not contain any data or custom roles». Son tres comandos, no uno.

**Hace falta Docker.** `supabase db dump` corre `pg_dump` dentro de un contenedor, así que con Docker Desktop apagado falla con `DockerRunError` y deja un archivo de 0 bytes. No hay `pg_dump` nativo en esta máquina. Levantar Docker Desktop y esperar unos segundos es todo.

```bash
# 0) una sola vez: enlazar el proyecto (ya está enlazado)
supabase link --project-ref sgnbbatucphbqhahgczq

mkdir -p backups

# 1) el esquema (tablas, vistas, funciones, policies)
supabase db dump --linked -f backups/$(date +%F)_schema.sql

# 2) los datos. --use-copy es mucho más rápido de restaurar que INSERTs
supabase db dump --linked --data-only --use-copy -f backups/$(date +%F)_data.sql

# 3) los roles del cluster
supabase db dump --linked --role-only -f backups/$(date +%F)_roles.sql
```

Para ver qué `pg_dump` va a correr sin ejecutarlo: agregar `--dry-run`.

Lo que dio la primera corrida (2026-10-15), como referencia de que salió bien:

| Archivo | Tamaño | Contenido |
|---|---|---|
| `_schema.sql` | 560 KB | tablas, vistas, funciones y policies |
| `_data.sql` | 4,7 MB | **133 bloques `COPY`** |
| `_roles.sql` | 297 B | roles del cluster |

`pg_dump` avisa que un dump `--data-only` puede no restaurarse sin
`--disable-triggers`. En la práctica el archivo ya empieza con
`SET session_replication_role = replica`, que desactiva los triggers durante la
carga — por eso el orden de §3 (roles → esquema → datos) funciona. Si alguna vez
falla por una restricción, ahí está la pista.

`backups/` está en `.gitignore` y tiene que seguir estándolo: el dump de datos trae RUT, teléfono, contrato y remuneración de cada empleado, y este repositorio es público. **Un dump en un commit es una filtración de dato personal, no un descuido de higiene.**

---

## 3. Probar que sirve

Un dump que nadie restauró es una hipótesis, no un respaldo. Se prueba una vez, completo, contra un proyecto de prueba — nunca contra producción.

1. Crear un proyecto nuevo en Supabase (Free sirve para esto).
2. Restaurar en orden: roles → esquema → datos.
   ```bash
   psql "$SCRATCH_DB_URL" -f backups/<fecha>_roles.sql
   psql "$SCRATCH_DB_URL" -f backups/<fecha>_schema.sql
   psql "$SCRATCH_DB_URL" -f backups/<fecha>_data.sql
   ```
3. Contar lo que tiene que estar:
   ```sql
   select count(*) from public.ots;        -- ~234 al 2026-10
   select count(*) from public.employees;
   select count(*) from public.inventory_lots;
   ```
4. Correr las tres consultas de control de la revisión de arquitectura (§1) contra la copia restaurada: si contestan lo mismo que producción, el respaldo es bueno.
5. **Borrar el proyecto de prueba.** Es una copia completa de dato personal.

Anotar acá la fecha de la última restauración probada:

| Fecha del dump | Restaurado y verificado | Por |
|---|---|---|
| — | — | — |

---

## 3b. Las migraciones NO son un respaldo

Hay que decirlo porque es la suposición natural: *"están las 196 migraciones en
git, con eso se reconstruye la base"*. **No se reconstruye.** Se probó el
2026-10-19 contra el stack local, partiendo de una base vacía:

- `supabase db reset` se corta en la migración 20 de 196
  (`20260221143200_hr_backfill_workers_to_employees.sql`), que aborta con
  *"No workers found in workers table"*. Es una migración que depende de datos:
  en una base vacía no puede pasar por diseño.
- Salteando esa, **62 de las 176 restantes fallan**. La mayoría en cascada, pero
  las raíces son reales: `gin_trgm_ops` sin la extensión, `set_updated_at()` que
  no existe todavía, un `EXCEPTION WHEN error` que no es una condición válida,
  un error de sintaxis en un `||`.
- Y lo más importante: **`maintenance_schedules` y `machine_downtime_logs` no las
  crea ninguna migración.** Sólo las alteran. Existen en producción porque se
  crearon fuera del historial. Son la misma deriva inversa que ya detectó
  `check:rls-drift` (11 objetos en la base que ningún archivo crea); acá se vio
  qué significa en la práctica.

Consecuencia para este documento: el **dump es el único camino de
recuperación**. No hay plan B por el lado de las migraciones, así que §3 —probar
una restauración de verdad— no es prolijidad, es el único eslabón que no está
verificado.

Un cuidado aparte, para no leer un falso verde: **`supabase db reset` terminó con
código de salida 0 a pesar de que la migración falló.** El error aparece en la
salida, pero el código de salida no lo refleja, así que un script que confíe en
`$?` va a decir que todo salió bien.

---

## 4. Cuándo

| Cuándo | Qué |
|---|---|
| **Antes de cada `supabase db push`** | Dump de esquema y datos. Es el momento de mayor riesgo y el más fácil de olvidar. |
| Semanal | Los tres comandos |
| Antes de cualquier migración que borre o mueva datos | Los tres, y restauración probada |
| Trimestral | Una restauración completa de prueba, aunque nada haya fallado |

Retención sugerida: 4 semanales + 12 mensuales. Hay que cruzarla con lo que diga la política de retención de dato personal cuando se escriba (Ley 21.719) — guardar dumps para siempre es, en sí mismo, guardar dato personal para siempre.

---

## 5. Operar con la aplicación caída

Esto es lo que falta y no se puede escribir desde el código: **lo tiene que contestar el taller.** Son las preguntas que importan a las 7 de la mañana con la prensa parada.

- ¿Cómo se numera una OT si la aplicación no responde? (hoy el correlativo lo da `generate_ot_number` en la base)
- ¿En qué papel se anota el parte de producción, y quién lo carga después?
- ¿Quién avisa a los operadores que el sistema está caído?
- ¿Cuánto puede operar la imprenta sin la aplicación antes de que se note en la entrega?

Hasta que esas cuatro tengan respuesta escrita, el plan de recuperación está a medias: se puede recuperar la base, pero no se sabe cómo trabajó el taller mientras tanto.
