# Auditoría de turnos, Cronograma y Planta sobre un escenario de prueba

*2026-10-28 · reemplaza el diagnóstico (§1) y la dotación (§5) de
`plan-turnos-y-operacion-2026-10-28.md`, que se escribieron sobre la seed
congelada en agosto. Las fases de ese plan siguen en pie; acá se reordenan con
lo que de verdad falla.*

## 1. El escenario

Toda la base es de prueba. Se rehízo para que el sistema tenga algo real que
planificar y casos de borde a propósito. Todo es reversible: el respaldo, el
manifiesto y `undo.cjs` están fuera del repo, en la carpeta temporal de la
sesión (`%TEMP%\claude\seed\`).

| Qué | Casos de borde que prueba |
|---|---|
| **27 OT abiertas**: las 17 de antes con plazos alrededor de hoy, y 10 nuevas clonadas de OT terminadas (conservan el presupuesto) | Una OT atrasada por 1 día (41230). Dos que vencen hoy y mañana. Un grupo apretado contra el troquel. Un urgente esperando visto bueno (41265). Dos esperando papel. Una con 30 días de holgura. Una OT con 0 h de terminaciones (41267). |
| **Prioridades** con `priority_level` | Un urgente partido en dos OT, offset y digital (41229 / 41229-B). |
| **411 asignaciones**, del 26-oct al 13-nov | Prensas con cuadrilla de 2. La Ryobi #2 sólo en Mañana, aunque su patrón dice M+T. Un aprendiz de troquel con algunas tardes y **una Noche** (4-nov). **Sábado** de taller para 2 personas (7-nov). Las dos personas con contrato de 8 h en Mañana, porque Taller (9 h) no les cabe. **Una asignación sobre una fila de turno archivada** (Hernán, 29-oct). |
| **2 licencias** | Daniel de vacaciones del 9 al 13-nov, sacado de la dotación. **Ruth con licencia médica aprobada el 12 y 13-nov y todavía asignada.** |
| **Ajuste** | Ryobi #1: 6 pasadas medidas, Carlos ≈ 20 min y Luis ≈ 42 min. Ryobi #2: 45 min fijados a mano (mantilla gastada). Roland: sin dato. 41229: corrección por OT de 55 min (Pantone). |
| **Patrones** | Polilaminadora sólo Mañana, Dobladora en Taller, Roland sólo lunes, miércoles y viernes. |
| **Habilidades** | Un aprendiz de troquel (nivel 2). Personas sin la habilidad asignadas a guillotina y taller. |
| **3 bloques fijados a futuro** | Uno limpio (41261) y **dos que se pisan en la Troqueladora** el jueves 29. |

La compuerta de cumplimiento laboral **funcionó**:
- Rechazó 4 días en que el aprendiz hacía Tarde (sale a las 22:00) y Mañana al
  día siguiente (entra a las 07:00): 9 h de descanso contra las 12 que pide su
  contrato.
- La de saldos de licencias rechazó una licencia de 45 h para una ausencia de
  dos días.

## 2. Lo que se arregló en esta pasada

Seis defectos encontrados con el escenario, todos corregidos, probados y en
`audit/captura-local-fase-1a`:

| # | Defecto | Gravedad | Commit |
|---|---|---|---|
| 1 | **Planta no veía la dotación.** Leía `worker_assignments` desde el navegador, y la tabla tiene RLS sin políticas desde el 1-ago: llegaban 0 filas, sin error. Todas las máquinas en "0/N" y todos "disponibles". Se asignaba a alguien, la escritura funcionaba y la persona desaparecía. Los topes de horas semanales y extra también sumaban cero. **Lo más probable es que por esto la dotación estuviera vacía.** | Crítica | `bb6c439` |
| 2 | **Un bloque fijado comprimía el trabajo**: 14,9 h de troquel "terminaban" en una ventana de 4 h, y la cadena siguiente arrancaba antes de tiempo. | Alta | `2c7f963` |
| 3 | **Dos bloques fijados que se pisaban** en la Troqueladora quedaban uno encima del otro sin aviso. | Alta | `2c7f963` |
| 4 | **Los 8 puestos del taller abrían con una sola persona**: el sábado, 2 operarios ponían trabajo en 5 puestos. | Alta | `2c7f963` |
| 5 | **Quien tenía licencia aprobada seguía contando** como capacidad en el Cronograma. | Media | `2c7f963` |
| 6 | **«Abrir en Planta» caía siempre en la Mañana**: el turno de la URL perdía contra el valor por defecto. Abrir una Noche desde el Cronograma no funcionaba. | Media | `bb6c439` |

Antes de esta pasada, ya en `1e70d3f`: la dotación sobre filas archivadas se
lee como su definición vigente. Con el escenario quedó verificado en las dos
pantallas: Hernán aparece en la Guillotina #2 el 29-oct.

**Verificado y correcto**:
- La Noche abierta con dotación (el aprendiz el 4-nov, con su nombre en la
  barra).
- Las horas fuera de turno se ven transparentes y no suman.
- Las fuentes del ajuste: corrección de la OT, valor fijado en la prensa,
  mediana medida (30 min con 6 muestras) y valor del presupuesto.
- Los bloques fijados vencidos se reprograman solos.
- El efecto cadena en las entregas.
- Los OT bloqueados se cuentan: «4 esperando VB, pre-prensa o papel».

## 3. Lo que muestra el plan, ya corregido

**Carga a dos semanas:**

| Máquina | Carga | Lectura |
|---|---|---|
| **Troqueladora** | **101 %** (con los dos bloques fijados en conflicto) | Es el cuello de botella. Un solo operario certificado. |
| **Polilaminadora** | **100 %**, sólo en Mañana | Necesita la Tarde. |
| Taller manual (8 puestos) | 41–90 % | Le alcanza, salvo el sábado y la semana de la licencia. |
| Ryobi #1 / Ryobi #2 | 56 % / 26 % | Holgura. La #2 está dotada sólo en Mañana. |
| Guillotinas | 10–17 % | Holgura. |

**Entregas:** 21 de 27 salen atrasadas y 6 a tiempo. Las atrasadas lo están
casi todas por la Troqueladora o por la Polilaminadora. 41268 (Chocolatería
Antuco, alta, plazo 30-oct) sale el 18-nov. Más dotación en las prensas no la
adelanta. Las palancas reales son la Tarde de la Polilaminadora y un segundo
troquelador.

## 4. Brechas abiertas, por gravedad

### Críticas

**A. El resto de las lecturas desde el navegador están igual de ciegas.** La
nómina mensual (`use-financial-queries.ts`) y la revisión de licencias y
contratos que hace "publicar semana" leen tablas con RLS desde el cliente.
Reciben cero filas, así que la nómina sale vacía y publicar valida contra
nada. Es el mismo arreglo de `bb6c439`, aplicado a todas las tablas: es el
"API sweep" que ya estaba pendiente. Una regla de ESLint que prohíba
`supabase.from('<tabla con RLS>')` fuera de `src/app/api` lo cerraría de raíz.

**B. Asignar exige elegir una OT.** `POST /api/worker-assignments` rechaza una
asignación a una máquina de producción sin `ot_id` (`assignment-rules.ts`).
Cargar una semana obliga a decidir por adelantado, por persona y por día, a
qué OT se cargan sus horas. Eso hace inviable el «Aceptar semana» del plan:
la dotación del escenario se cargó directo a la base porque por la API no
habría entrado. **Hay que tomar una decisión de diseño.** Propuesta: separar
la **dotación** (persona × máquina × turno, lo que planifica el supervisor)
de la **imputación** (a qué OT van esas horas). La imputación se deduce de lo
que la máquina corrió en ese turno: los partes de etapa y el QR de la fase 4
del plan. La regla de costo se mantiene, pero se cumple al cerrar el turno, no
al planificarlo.

### Altas

**C. Una máquina en mantención se sigue planificando.** Planta marca la
Digital y la Roland como "En mantención". El Cronograma les programa trabajo
igual: 41267 en la Roland el 30-oct, y la parte digital de 41215. El estado
de la máquina y las ventanas de `maintenance_schedules` tienen que cerrar
calendario.

**D. Los OT bloqueados ocupan la máquina ahora.**
- 41265 espera el visto bueno y está primera en la Ryobi #2 a las 07:00 de
  mañana.
- 41243 y 41269 esperan papel y ya tienen fecha de entrega.

Hace falta una fecha estimada de desbloqueo (llegada del papel por OC, visto
bueno prometido) como inicio mínimo. Sin ese dato, el bloqueado debería ir
detrás de los que pueden correr.

**E. No se revisan las habilidades.**
- Hernán, Sonia y Álvaro están asignados sin la habilidad de su máquina.
- El aprendiz de troquel (nivel 2) quedó solo en la Troqueladora de noche.

Ni Planta ni el Cronograma lo dicen. Es la fase 1.1 del plan: la capacidad
por persona y no por máquina.

**F. Planta no avisa de una licencia.** Ruth sigue en el tablero el 12-nov
sin ninguna marca. El Cronograma ya no la cuenta, así que las dos pantallas
dicen cosas distintas. Planta debería mostrar a la persona tachada, con la
licencia, y ofrecer reemplazarla.

### Medias

**G. Solape entre turnos dentro de una máquina.** En el taller, Mañana tiene
2 personas y Taller 8, así que de 07:00 a 14:00 hay 10 personas en 8
puestos. El tope de Planta se revisa por turno y no por hora, y no lo
detecta.

**H. El ajuste no usa al operario del turno.** La Ryobi #1 planifica con la
mediana de la prensa (30 min), pero el sistema sabe quién está: Carlos
(≈ 20 min) en la Mañana y Luis (≈ 42 min) en la Tarde. El dato por operario
ya se mide; falta usarlo al colocar el bloque.

**I. ¿Taller 07–16 son 9 h u 8 h + colación?** La compuerta cuenta 9 h
brutas: un contrato de 8 h no puede trabajar Taller, y uno de 45 h no puede
hacer ni un sábado. Si la colación no se paga, Taller debería contar 8 h.
**Decisión pendiente.**

**J. Gran parte de las horas del taller son supuestas.** Desglose y embalaje
salen de tasas supuestas ("Estimación supuesta"). Las fases 1.3 y 4 del plan
lo resuelven.

### Bajas

**K. La etiqueta del carril muestra el patrón, no la dotación.** La Ryobi #2
dice "Mañana + Tarde", pero esta semana sólo tiene Mañana. Los bloques sí
respetan la dotación: es sólo la etiqueta.

**L. La carga pasa de 100 %** cuando hay bloques fijados en conflicto.
Correcto como señal, pero sin explicación al lado.

## 5. Dotación recomendada para el escenario

Con lo que muestra el plan corregido:

1. **Polilaminadora Tarde (14–22).** Pasar a una persona de Corte, que tiene
   holgura (guillotinas al 10–17 %). Es la palanca más barata: libera la
   cadena de las cajas.
2. **Segundo troquelador.** Certificar a Sebastián, que ya está en nivel 2, y
   darle la Tarde de la Troqueladora de lunes a jueves. Mientras no esté
   certificado, que no quede solo de noche (brecha E). El tope de horas
   extra (2 h/día) no alcanza para cubrir con Miguel solo.
3. **Ryobi #2 en Tarde sólo si hace falta.** Hoy la carga (26 %) no lo
   justifica. Gustavo, de la Ryobi #2, puede reforzar el taller la semana de
   la licencia de Daniel.
4. **Ningún turno Noche** salvo el del troquel ya cargado.

Esto se puede cargar cuando la brecha B tenga decisión. Hoy, por la API,
cada asignación pediría una OT.

## 6. Orden recomendado

1. **A** (lecturas por la API) y **B** (dotación separada de la imputación):
   destraban todo lo demás.
2. **C, D y E**: el plan deja de prometer máquinas en mantención, papel que
   no llegó y personas sin la habilidad.
3. **F, G y H**, y después las fases 2–5 del plan («Aceptar semana», «Hoy», el
   QR de producción).
