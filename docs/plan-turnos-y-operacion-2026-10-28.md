# Turnos, Cronograma y avance de OT: de cargar datos a aprobar un plan

*2026-10-28 · después de entregar el Cronograma Gantt, el modelo de turnos y el
ajuste de prensa (commits `1e70d3f`, `4b6cd9a`).*

## 1. El diagnóstico en una frase

**La app sabe planificar, pero la planta no le está dando los datos, porque
dárselos cuesta demasiado.** El Cronograma ya calcula bien, pero sus
supuestos están vacíos o desactualizados, y los números del 2026-10-28 lo
muestran:

| Lo que el sistema mostraba | Lo que significa |
|---|---|
| **0** asignaciones en `worker_assignments` desde ayer hasta 21 días adelante | Nadie carga la dotación. El Cronograma planifica sólo con el *patrón* de cada máquina, sin saber quién viene. |
| **16 de 17** OT abiertas con 64 a 106 días de atraso (plazos de agosto) | Los plazos no se renegocian en el sistema. Si todo está en rojo, el rojo no avisa nada. |
| **17** OT abiertas en total | Es muy poco para una planta de 38 personas. Lo más probable es que el trabajo real todavía no entre todo a la app. |
| Troqueladora planificada a 2 turnos, con **1** sola persona con la habilidad Troquelado | La capacidad se calcula por **máquina**, no por **persona**. El plan promete horas que nadie puede trabajar. |
| Taller manual modelado con `max_workers = 10` (parece un valor por defecto) | Cuántas estaciones hay de verdad es un supuesto que nadie confirmó. |
| La semana "publicada" de Planta se guarda en `localStorage` | Publicar no le avisa a nadie: queda guardado sólo en ese navegador. |
| Planta tiene **11** pestañas | Para el uso diario, hay que saber dónde está cada cosa. |
| El avance de una OT entra por **4** puertas: arrastre en el Kanban + cierre de etapa, WhatsApp, Hoja de Producción y el arrastre en el Cronograma | Cada una con su propio formulario. Nadie sabe cuál es "la" forma de reportar. |

La raíz común: **el sistema le pide a la persona que construya el plan desde
cero cada día**: arrastrar 30 operarios a máquinas, turno por turno. Una planta
con apuro no lo hace, y el plan se queda con datos de ejemplo.

## 2. El principio de diseño

> **El sistema propone, la persona corrige la excepción.**

Hoy, cada dato lo pone una persona: la dotación, los plazos, los cierres, el
ajuste. La propuesta invierte eso:

1. **Lo habitual no se carga.** Lo habitual es el patrón de turnos, la cuadrilla
   de cada máquina y las habilidades de cada uno. Se configura una vez y el
   sistema arma la semana solo.
2. **La persona aprueba y corrige.** Aceptar la semana es un botón. Lo que se
   edita son las excepciones: una licencia, una noche extra, alguien que se
   cambia de máquina.
3. **El avance se reporta donde ocurre.** Se hace en la máquina, con un toque
   desde el QR que ya existe para mantención, y no en un formulario de
   escritorio horas después. WhatsApp queda como respaldo, no como canal
   principal.
4. **Un rojo significa algo.** Las alertas se miden contra la fecha
   *comprometida* vigente, no contra un plazo de agosto que todos saben que no
   se cumplió.

## 3. El plan, por fases

Cada fase se puede entregar sola y deja la planta mejor que antes. Están
ordenadas por cuánto destraban, no por tamaño.

### Fase 1 — Que el plan no mienta (1–2 días)

| # | Cambio | Por qué primero |
|---|---|---|
| 1.1 | **Capacidad por persona.** Cada tipo de máquina declara la habilidad que exige (`offset_printer` → «Offset», troqueladora → «Troquelado», etc.). Un turno sólo es productivo si alguien con esa habilidad puede cubrirlo: hay que mirar el patrón *y* las habilidades. El Cronograma marca **«sin operario calificado»** donde hoy cuenta horas fantasma. | Es el error más caro: hoy el plan promete la Troqueladora a 2 turnos. |
| 1.2 | **Fecha comprometida.** Agregar un campo `committed_date`, distinto del `deadline` original. Un botón en la lista de entregas: **«Comprometer la fecha proyectada»**, de a una o para todas las atrasadas. El atraso se mide contra la fecha comprometida, y el historial guarda cuántas veces se movió. | Devuelve el sentido al rojo, sin borrar el plazo original, que es evidencia. |
| 1.3 | **Confirmar los supuestos.** Una tarjeta en Configuración con los valores que el Cronograma hoy *supone*: estaciones del taller, tasas de desglose, embalaje y plegado, y el ajuste por defecto. Cada uno indica si es «supuesto» o «medido», con el número de muestras. | Es lo que separa un plan que el jefe de planta firma de uno que mira con desconfianza. |
| 1.4 | **Publicar la semana en el servidor.** Crear la tabla `published_weeks` y quitar `localStorage`. | Publicar tiene que ser un hecho que otros ven. |

### Fase 2 — La semana se arma sola (3–5 días)

**«Semana propuesta»** en Planta:

1. **Demanda.** El Cronograma ya calcula las horas por máquina y día. Esas
   horas son la demanda.
2. **Oferta.** El sistema cruza quién está activo, quién no tiene licencia
   (`useWorkflowLeaveStatuses` ya existe), las habilidades y el patrón habitual
   de cada persona: su máquina y turno de siempre, que se aprenden de las
   últimas 4 semanas de dotación.
3. **Propuesta.** Una grilla de máquinas × días. Cada celda muestra la
   **demanda frente a lo dotado** en color: verde si está cubierta, ámbar si
   está justa, rojo si falta gente, gris si sobra gente. Esta es la grilla que
   quedó pendiente de la fase 5 anterior.
4. **Un botón: «Aceptar semana».** Escribe los `worker_assignments` de los
   5 días. A partir de ahí, la dotación existe y el Cronograma pasa de
   *patron* a *dotacion*, con los nombres sobre cada barra.
5. **Corregir la excepción.** Se arrastra una persona de una celda a otra. El
   rojo y el verde se recalculan en el momento.

Así el trabajo del supervisor pasa de unos ~150 arrastres por semana
(30 personas × 5 días) a revisar los rojos de la grilla y aceptar.

### Fase 3 — «Hoy»: una sola pantalla para el jefe de planta (3–4 días)

Hoy, para saber cómo va el día hay que pasar por el Kanban, Planta, el
Cronograma y WhatsApp. **«Hoy»** las reemplaza para el uso diario. Es una fila
por máquina:

```
Ryobi #1   ● Juan, Pedro    41229 offset  ▓▓▓▓▓▓░░░  62%  · sale 15:40 (plan 15:00, +40 min)  → sigue 41215
Troquel    ● Ana            41227 troquel ▓▓▓░░░░░░  30%  · ⚠ Tarde sin operario calificado
Taller     ● 7/10 presentes 3 OT en curso                      · 2 libres → sugerir desglose 41221
```

- El avance sale de los reportes (fase 4). El desvío contra el plan sale del
  Cronograma. Si el desvío corre una entrega, la fila lo dice y nombra a qué
  cliente afecta.
- Las alertas se ven ahí y no en una campana: material que falta («Esperando
  papel»), turno sin cubrir, OT bloqueada o mantención vencida.
- Planta pasa de 11 pestañas a **3**: **Hoy**, **Semana** (la grilla de la
  fase 2 más el Cronograma) y **Configuración** (patrones, habilidades,
  supuestos y costos). Las demás pestañas se pliegan dentro de estas tres o se
  retiran. Es la misma lógica que se usó con Personas en `refactor(personas)`.

### Fase 4 — Reportar en la máquina, con un toque (3–5 días)

El QR de cada máquina ya abre mantenciones sin login (`/m/[token]`, endurecido
en `f478fc5`). Se le agrega una pestaña **Producción**:

- Arriba aparece **la OT que el plan dice que toca ahora**. Tres botones
  grandes: **Empecé**, **Terminé ajuste** y **Terminé**. El operario se
  identifica con su credencial (`badge_code` ya existe en empleados).
- Cada toque guarda una **marca de tiempo real**. Las horas y el ajuste ya no
  se parsean de un texto: se miden. El historial que afina las estimaciones
  pasa a ser exacto, y el ajuste por prensa y por operario sale solo.
- Al terminar se pregunta sólo lo que falta, y sólo si aplica: merma y
  observación. Es lo mismo que pide `CierreDeEtapa`, pero en una pantalla de
  teléfono.
- WhatsApp sigue funcionando para quien no use el QR, y su parte retroactivo
  completa lo que falte (`4b6cd9a`).

Con esto, las 4 puertas quedan en **una principal** (el QR en la máquina) y
dos de corrección: el Kanban para el supervisor y WhatsApp como respaldo.

### Fase 5 — Que dé gusto usarlo (continuo)

La gente no llena un sistema que no le devuelve nada. Esto es lo que devuelve:

- **Para el operario**, en el QR:
  - «Tu turno de hoy», con su máquina, sus OT y quién está con él.
  - Su ajuste promedio en esta prensa frente al de la planta, mostrado como
    dato propio y nunca como ranking público.
- **Para el supervisor**:
  - **Plan cumplido %** por semana: entregas en la fecha comprometida y horas
    reales frente a las planificadas.
  - La tendencia del ajuste medio por prensa. Cuando sube, avisa: es la
    primera señal de una mantilla gastada o de una prensa que pide
    mantención.
- **Para Comercial**:
  - **«¿Para cuándo lo puedo prometer?»** al cotizar. El Cronograma simula la
    OT nueva dentro de la cola real y devuelve la primera fecha posible. Es
    el mismo motor que ya simula atrasos.

## 4. Brechas para un sistema de primer nivel

Lo que un MES/APS serio tiene y esta app todavía no, ordenado por impacto:

1. **Restricción de material.** El plan ignora el estado «Esperando papel» o
   «Compras», y programa impresión sobre papel que no llegó. El programador
   tiene que esperar a la recepción (`oc` / inventario) antes de colocar la
   impresión.
2. **Mantención dentro del calendario.** Una mantención preventiva programada
   (`maintenance_schedules`) debería cerrar esa ventana en la máquina. Hoy el
   Cronograma no la ve, y mantención y producción compiten sin saberlo.
3. **Ausencias.** Las licencias y vacaciones existen en RR.HH. pero no restan
   capacidad. Este punto entra con la fase 2.
4. **Secuenciación por ajuste.** Agrupar en la misma prensa los trabajos con
   tintas o papel compatibles reduce los ajustes. El dato por pasada ya
   existe, y lo que falta es la heurística de orden. Es el ahorro más
   directo en horas de prensa.
5. **Costo del turno extra.** Abrir una Noche debería mostrar su costo
   (recargo y horas extra) frente a las entregas que salva. El modelo de
   costo de Planta ya existe, falta conectarlo.
6. **Escenarios guardados.** Hoy la simulación de atraso se pierde al cerrar
   la pantalla. Comparar «con Noche el jueves» frente a «sin Noche» debería
   poder guardarse y compartirse.
7. **OEE por máquina.** Con marcas de tiempo reales (fase 4) salen solas la
   disponibilidad, el rendimiento y la calidad (la merma).
8. **Calidad de datos.**
   - Las 16 OT atrasadas se resuelven con la fase 1.2.
   - La mayoría de las OT caen en la Ryobi #1 por defecto en la Hoja de
     Producción.
   - Hay un bloque fijado en 40502 → Guillotina #1 que nadie reconoce.
   - Hay que confirmar si las 17 OT abiertas son de verdad todo el trabajo en
     curso.

## 5. Propuesta de dotación para la semana del 2 al 6 de noviembre

Calculada con la carga del Cronograma a 2 semanas (2026-10-28, sobre 17 OT
abiertas) y los 38 empleados activos. Las horas por día son aproximadas
(≈ 10 días hábiles en la ventana).

**Carga de cada máquina:**

| Máquina | Carga | ≈ h/día de trabajo | Dotación propuesta |
|---|---|---|---|
| **Troqueladora** | 72 % de 2 turnos | **≈ 10,8** | Mañana: el único troquelador. Tarde: **hace falta un segundo operario**. |
| Taller manual (7 estaciones) | 52–83 % | ≈ 43 (≈ 5 personas) | Taller 07–16: 6 con la habilidad de taller + 4 de Terminaciones = 10. |
| Dobladora | 51 % | ≈ 7,7 | 1 de Terminaciones, en Taller 07–16. Conviene pasar su patrón de M+T a Taller. |
| Polilaminadora | 35 % | ≈ 5,3 | 1 de Corte, en Mañana. |
| Ryobi #1 | 33 % | ≈ 5 | 1 cuadrilla de Offset, en Mañana. |
| Ryobi #2, Roland 300 | 0 % | — | Sin turno. Es una ventana para mantención preventiva. |
| Digital | 8 % | ≈ 1,2 | Pre-prensa, por ratos. |
| Guillotinas #1–3 | 4–5 % c/u | ≈ 2 en total | 1 operador de Corte, en Mañana. |
| Despacho | ≈ 13 % | — | 1 persona de Despacho. |

**Lo que dicen los números:**

1. **El cuello de botella es la Troqueladora, y es de personas, no de
   máquina.** Se necesitan ≈ 10,8 h/día y una sola persona puede dar ≈ 7.
   Cubrirlo con horas extra no da: en Chile el tope son 2 h por día, así que
   quedarían ≈ 2 h/día sin cubrir. **Acción: capacitar en troquelado esta
   semana a uno de los 3 operarios de Corte con habilidad de guillotina.**
   Corte es el área con más holgura, con 6 personas para ≈ 2 h/día de
   guillotina. Mientras tanto, el patrón de la Troqueladora debería ser sólo
   Mañana, para que el Cronograma muestre las fechas reales.
2. **Con las 17 OT que hay en el sistema, sobra gente.** Hay ≈ 4 personas
   libres en Terminaciones, ≈ 4 en Offset y ≈ 3 en Corte. O la planta tiene
   holgura de verdad, o, más probable, **hay trabajo que no está cargado en la
   app**. Hay que resolver esto antes de decidir turnos de noche: un plan sólo
   es tan bueno como la cola que ve.
3. **Ningún turno Noche** hace falta con esta cola.

Esta dotación **no está cargada**: escribir `worker_assignments` con nombres
reales es una decisión del supervisor. Se puede cargar en cuanto se confirmen
quiénes van a cada puesto. La fase 2 es justamente el botón que la arma sola.
