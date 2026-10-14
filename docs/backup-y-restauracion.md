# Respaldo y restauración

Qué se respalda, con qué comando, dónde queda, y cómo se prueba que sirve.

| | |
|---|---|
| Escrito | 2026-10-14, como Fase 0 del [plan de remediación](audit-remediation-plan-2026-10-14.md) |
| Estado | **El procedimiento está escrito; nadie ha tomado ni restaurado un respaldo todavía.** Los comandos necesitan la credencial del proyecto, que tiene el dueño. |
| Por qué existe | La checklist de salida a producción de julio tiene el ítem de respaldo sin marcar. El repositorio no tenía script de dump, prueba de restauración, ni procedimiento para operar con la aplicación caída. |

---

## 1. Antes que nada: qué plan de Supabase

De la [página de precios de Supabase](https://supabase.com/pricing):

| Plan | Respaldo automático | Otras |
|---|---|---|
| Free | **Ninguno.** Además el proyecto se pausa tras una semana sin uso, y el límite es 500 MB | — |
| Pro | Diario, retención 7 días | Point-in-time recovery es un adicional aparte |

**Si el proyecto está en Free, no existe ningún respaldo automático hoy.** Los comandos de abajo son entonces el único respaldo, y hay que correrlos a mano. Pasar a Pro es la compra de mayor valor en todo el plan de remediación: convierte "no hay respaldo" en "hay uno de ayer".

Esto es una decisión del dueño (Q-2 del plan). El resto de este documento sirve igual en cualquiera de los dos planes: un respaldo automático que nadie restauró nunca tampoco es un respaldo.

---

## 2. Tomar el respaldo

`supabase db dump` **no** trae todo en una sola pasada. La referencia del CLI es explícita: por defecto excluye los esquemas administrados por Supabase (`auth`, `storage`, los de extensiones) y «does not contain any data or custom roles». Son tres comandos, no uno.

```bash
# 0) una sola vez: enlazar el proyecto
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
