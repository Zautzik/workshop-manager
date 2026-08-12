# De la cotización a la OT: un precio en dos tiempos

**Estado:** propuesta · 11 de agosto de 2026
**Origen:** el vendedor necesita dar un precio por teléfono en dos minutos, pero la OT
que ese precio origina pide cuarenta campos. Hoy los dos formularios no se hablan.

---

## 1 · Hay un solo Visto Bueno, y es el de prueba

El pedido era «igualar la información entre `+Nueva Cotización` y `+Nueva OT`, y agregar
una fase de Visto Bueno antes de Compra de Papel».

La primera versión de esta especificación proponía **dos** aprobaciones: una comercial
(el cliente acepta el precio) y una técnica (el cliente aprueba la prueba). El dueño la
corrigió, y la corrección es la que ordena todo lo demás:

> *Aceptar el precio no significa nada hasta que se aprueba el visto bueno de prueba, y
> es ahí donde quedan definidos los costos estimados. Visto Bueno es siempre visto bueno
> de prueba.*

Es correcto y es cómo funciona el oficio. Un cliente que dice «dale, mándame la prueba»
no compró nada: no hay documento, no hay compromiso, y el taller no movió un pliego. **El
único acto que obliga a las dos partes es la firma sobre la prueba**, y ocurre después de
que Pre-Prensa hizo el trabajo de saber qué se va a imprimir de verdad.

Eso tiene tres consecuencias de diseño:

**a) La cotización es una estimación, no un contrato.** Sirve para que el cliente decida
si sigue conversando. Vive como `vistos_buenos` en estado `draft` y no fija nada.

**b) El Visto Bueno se firma en la fase `visto_bueno`, no al cotizar.** Hoy la pantalla
de Cotizaciones tiene un botón «Marcar firmada» que dispara la firma antes de que exista
una prueba. Eso es firmar un papel en blanco.

**c) Los costos quedan definidos en el Visto Bueno.** No en la cotización, donde son una
banda, ni en Pre-Prensa, donde todavía se están completando. Al firmar la prueba se
congela el precio y a partir de ahí toda diferencia es del taller.

El recorrido, entonces:

```
Cotización            estimación con banda · el cliente decide si sigue
      ↓
OT nace en pre_press  hereda todo lo cotizado, con la lista de lo que falta
      ↓
Pre-Prensa            completa el nivel 2 y produce la prueba
      ↓
VISTO BUENO           el cliente firma la prueba · AQUÍ SE FIJAN LOS COSTOS
      ↓
Compra de Papel       punto de no retorno: se compra y se graban planchas
```

El enum `ot_status` ya tiene ese orden —`pre_press → visto_bueno → paper_purchase`— y
nadie lo estaba usando como parada real.

---

## 2 · El modelo: tres niveles de completitud

Una OT no está «completa o incompleta». Está completa **para algo**.

### Nivel 1 · Cotizable

Lo que un vendedor puede juntar con el cliente al teléfono. Alcanza para decir un precio
con una banda declarada.

```
cliente · producto · cantidad · ancho · alto · gramaje · sustrato
colores frente/dorso · cobertura de tinta · terminaciones (cuáles)
fecha de entrega · prensa objetivo
```

**Produce:** precio estimado **con banda de incertidumbre**. Nunca un precio firme.

### Nivel 2 · Producible

Lo que Pre-Prensa tiene que agregar antes de que se pueda comprar un solo pliego.

```
marca y proveedor del sustrato   → de esto depende el precio real del papel
montaje confirmado                → poses reales, no la mejor imposición teórica
máquina asignada                  → define el pliego posible y la velocidad
pantones definitivos              → cada uno es una plancha y una pasada
arte adjunto, o `sin_arte` declarado
detalle de producción             → tapas, ítems, pliegos, si el trabajo los tiene
operaciones revisadas             → el jefe de taller corrige lo que el motor propuso
```

**Produce:** precio firme. **Compuerta:** sin nivel 2 no se sale de `pre_press`.

### La maqueta: el costo que ocurre en el medio

Entre el nivel 1 y el 2 pasa algo que no es un campo del formulario. En Pre-Prensa
se arma a mano un ejemplar del producto —cortado con bisturí o en mesa de muestras,
doblado y pegado— para que el cliente lo tenga en la mano antes de aprobar. En envase
es casi obligatorio: nadie firma un estuche mirando un PDF.

Es el costo que todos los sistemas pierden, y por tres razones a la vez:

1. **Ocurre antes de que el trabajo exista.** No hay tiraje al que cargarlo, no hay
   pliegos que contar. Se paga y se disuelve en «gastos generales».
2. **Se repite.** Un cliente exigente pide tres vueltas, y cada vuelta es material
   nuevo, impresión nueva y horas nuevas de alguien.
3. **Se paga aunque el trabajo no salga.** Si el cliente no aprueba el Visto Bueno,
   la maqueta ya se hizo. Eso es lo que cuesta perder una cotización, y hoy no
   aparece en ninguna parte — así que nadie sabe cuánto cuesta perder.

Medido sobre una vuelta típica —cuatro pliegos de cartulina 300, impresos en digital,
dos horas de armado a mano:

```
material     $1.960     4 pliegos × $490
impresión    $2.380     4 clics × $595
mano de obra $13.000    2 h × $6.500
             ───────
             $17.340    por vuelta
```

**La mano de obra es tres veces todo lo demás junto.** Es lo que hace que una maqueta
sorprenda: cuatro pliegos de cartulina no son nada, dos horas de alguien armándola sí.
Tres vueltas son $52.020 antes de imprimir el primer pliego del tiraje.

Dos decisiones de modelado, en `maqueta.ts` con pruebas:

- **El troquel de muestra no se repite entre vueltas.** Se corta una vez y la segunda
  maqueta lo reutiliza. Multiplicarlo por vuelta sería inventar un costo que el taller
  no pagó.
- **Entra al ledger descompuesto**, no como un bulto llamado «maqueta»: material,
  máquina y mano de obra por separado, con la vuelta en la descripción. Un bulto deja
  la pantalla de «Estimado vs Real» con una diferencia sin explicación; descompuesto se
  ve que fueron cuatro pliegos y tres horas.

Y una lectura que corrige la rentabilidad por cliente: **un cliente que pide tres
vueltas y aprueba a la tercera puede dejar menos que uno que paga menos y aprueba a la
primera**, y mirando sólo el margen del tiraje los dos se ven iguales.
`maquetaLoadByClient` expone las vueltas por trabajo — arriba de 2 es un cliente que
cuesta convencer.

### Nivel 3 · Cerrable

Costos reales cargados, guía emitida, factura emitida. Ya existe y ya se mide
(`margin-confidence.ts`).

---

## 3 · La brecha, medida

Campo por campo, entre lo que hoy captura cada formulario:

| | Cotización | +Nueva OT | Nivel |
|---|---|---|---|
| cliente · producto · cantidad | ✓ | ✓ | 1 |
| ancho · alto · gramaje · sustrato | ✓ | ✓ | 1 |
| colores frente/dorso | ✓ *(número)* | ✓ *(modo + pantones)* | 1 / 2 |
| cobertura de tinta | ✓ | ✓ | 1 |
| **terminaciones** | ✗ *(una casilla = plegado)* | ✓ *(10 + configuración)* | **1** |
| **fecha de entrega** | ✗ | ✓ | **1** |
| **prioridad** | ✗ | ✓ | **1** |
| **prensa objetivo** | ✗ | ✓ | **1** |
| tipo de producto | ✗ *(fijo `etiqueta`)* | ✓ | 1 |
| categoría de trabajo | ✗ | ✓ | 1 |
| marca y proveedor del sustrato | ✗ | ✓ | 2 |
| montaje interactivo | ✗ | ✓ | 2 |
| detalle de producción | ✗ | ✓ | 2 |
| arte adjunto / `sin_arte` | ✗ | ✓ | 2 |
| operaciones editables | ✗ | ✓ | 2 |

**Ocho campos de nivel 1 faltan en la cotización.** Todos son baratos de pedir —el
vendedor los sabe o los pregunta— y cuatro de ellos cambian el precio.

### Una aclaración sobre «igualar»

Igualar **no** significa poner cuarenta campos en el diálogo del vendedor. Eso destruiría
lo único que ese diálogo hace bien, que es dar un precio en dos minutos.

Igualar significa: **los dos formularios llenan el mismo modelo**, la cotización llena el
nivel 1 completo, y la brecha hacia el nivel 2 es visible y se cierra en Pre-Prensa.

---

## 4 · Lo que hace honesto un precio en dos tiempos

Acá está el riesgo del diseño, y no es técnico.

Si el vendedor cotiza $976.811 y Pre-Prensa descubre que el trabajo cuesta $1.056.750,
alguien come la diferencia. Un precio en dos tiempos sin mecanismo es una trampa con
pasos extra.

Hacen falta dos cosas, y son la parte del plan que no se puede recortar:

**a) La banda se declara en la cotización.** No «$976.811» sino «entre $980 mil y $1,4
millones, y esto es lo que falta saber para cerrarlo». El vendedor puede decir eso por
teléfono sin vergüenza; lo que no puede es prometer un número y desdecirse.

Lo que ensancha la banda es concreto y enumerable:

| Sin saber | Efecto sobre el precio |
|---|---|
| la prensa | ±40% — el pliego que entra decide poses y horas |
| la marca del papel | ±15% — el precio real sale del lote comprado |
| el montaje real | ±20% — la mejor imposición teórica rara vez es la que se monta |
| las terminaciones exactas | ±25% — troquel, pegado y hot stamping no son una casilla |

**b) La prueba se firma sobre el precio firme, no sobre el cotizado.** Como el Visto
Bueno es el único acto que obliga, el documento que el cliente firma tiene que llevar el
precio de nivel 2 — el que salió del montaje real y del papel real.

Si ese precio se alejó de la banda cotizada, la pantalla lo dice antes de mandar la
prueba: *«cotizado $976.811, firme $1.426.613, 46% arriba — está fuera de la banda que se
le dio al cliente»*. No lo bloquea: el vendedor decide si absorbe, renegocia o explica.
Lo que no puede pasar es que se entere después de firmar.

---

## 5 · El plan

### Fase 1 · El modelo compartido

Hoy `Cotización` tiene su propio estado local y `+Nueva OT` usa `UnifiedOTForm`. Son dos
modelos para una cosa — el patrón de siempre en este repo.

**Crear** `src/lib/ot-spec.ts` — puro, probado:

```ts
export type SpecLevel = 1 | 2 | 3;

/** Lo que falta para alcanzar un nivel, con el nombre que usa el taller. */
export function missingFor(level: SpecLevel, spec: Partial<UnifiedOTForm>): Gap[];

/** El nivel que la ficha alcanza hoy. */
export function specLevel(spec: Partial<UnifiedOTForm>): SpecLevel | 0;

/** Ancho de la banda de precio, derivado de lo que NO se sabe. */
export function priceBand(spec: Partial<UnifiedOTForm>, base: number): {
  low: number; high: number; drivers: BandDriver[];
};
```

`UnifiedOTForm` pasa a ser el modelo único. La cotización llena un subconjunto.

**Pruebas:** una ficha de nivel 1 no alcanza el 2 · cada campo faltante aparece con su
nombre de taller · la banda se angosta al agregar la prensa · una ficha completa tiene
banda cero.

---

### Fase 2 · La cotización llena el nivel 1 entero

**Cambiar** `src/app/comercial/cotizaciones/page.tsx`:

- **Prensa objetivo** (desplegable, Ryobi por defecto) → pasar `pressLimit`,
  `machineSpeedSheetsHr`, `pressBodies` e `imposition` al motor.
  *Esto solo corrige un subcosteo del 32% medido: hoy cotiza sobre un pliego 77×110 que
  ninguna prensa del taller puede agarrar.*
- **Fecha de entrega** y **prioridad**.
- **Terminaciones reales** — los diez booleanos, en una fila de chips, no una casilla.
- **Tipo de producto** — hoy toda cotización nace como `etiqueta`, literalmente fijo en
  el código.
- **Clientes desde `clients`**, con «+ Cliente nuevo» ahí mismo. Hoy la lista se arma
  desde las OT existentes, así que **no se le puede cotizar a un cliente nuevo** — que es
  justo cuando se cotiza.
- **Banda de precio** en lugar de un número solo, con los motivos listados.
- **Quiebre por cantidad** — `computeMultiQuantityQuotes` ya existe y ya resuelve bien el
  problema difícil (vuelve a correr el motor por cada cantidad para que el alistamiento
  se amortice). Falta enchufarlo.

**Pruebas:** el mismo trabajo cotizado con y sin prensa da pliegos distintos · el quiebre
por cantidad baja el unitario · una cotización sin fecha no se guarda.

---

### Fase 3 · La OT nace heredando, no en blanco

**Cambiar** la conversión VB → OT para que copie **todo** el nivel 1, y **crear** el
recorrido de Pre-Prensa que completa el nivel 2.

- La OT convertida arranca en `pre_press` con los campos ya llenos y una **lista de lo
  que falta** — la misma que devuelve `missingFor(2, spec)`.
- Pre-Prensa no es un formulario nuevo: son los pasos del asistente unificado que aún no
  tienen respuesta. El resto viene resuelto.
- Al completarse, se recalcula el precio firme y se compara contra el cotizado.

**Pruebas:** una OT convertida conserva sustrato, terminaciones, fecha y prensa · una OT
convertida sin arte declara `sin_arte` · el precio firme se recalcula con el montaje real.

---

### Fase 4 · Las compuertas

**Cambiar** `src/lib/ot-state-machine.ts` — hoy permite saltar de cualquier estado a
cualquier estado posterior:

```ts
const FORWARD_TRANSITIONS = new Map(
  STATUS_ORDER.map((s, i) => [s, STATUS_ORDER.slice(i + 1)])
);
```

Agregar dos condiciones, con el motivo en el mensaje:

| Transición | Exige | Si no |
|---|---|---|
| `pre_press → visto_bueno` | nivel 2 completo | «Faltan 3 datos para poder comprar papel: marca del sustrato, montaje confirmado, arte.» |
| `visto_bueno → paper_purchase` | prueba aprobada por el cliente **y** precio firme dentro del 10% de lo cotizado | «El precio firme quedó 46% sobre lo cotizado. Hay que reconfirmar con el cliente antes de comprar.» |

Se valida en el servidor, no sólo en el tablero: el Kanban arrastra, pero la API es la
que decide.

**Pruebas:** no se puede saltar de `pre_press` a `paper_purchase` · una OT incompleta no
sale de Pre-Prensa · un desvío del 8% pasa y uno del 12% no · el motivo nombra los campos
que faltan.

---

### Fase 5 · Que se vea

- **Chip de nivel** en la tarjeta del Kanban: `Nivel 1 · faltan 5` / `Nivel 2 · lista para
  papel`. El jefe de taller ve de un vistazo qué se puede empezar.
- **Columna Visto Bueno** en el tablero, entre Pre-Prensa y Compra de Papel — hoy el enum
  la tiene y el tablero no la muestra como parada real.
- **La comparación cotizado vs firme** en la ficha de la OT, con la diferencia y su
  motivo. Es el dato que le enseña al vendedor a cotizar mejor la próxima vez.

---

## 6 · Lo que este plan NO hace, y por qué

**No convierte la cotización en el asistente de ocho pasos.** El diálogo del vendedor
tiene que seguir dando un precio en dos minutos. Se le agregan ocho campos que se
responden en treinta segundos y cambian el precio; no cuarenta que se responden en media
hora y lo cambian poco.

**No mueve el montaje interactivo a la cotización.** Es la herramienta correcta para
Pre-Prensa y sería un obstáculo por teléfono. La cotización usa la imposición automática
y declara que puede moverse.

**No elimina la aprobación comercial.** Siguen siendo dos: el cliente acepta un precio, y
más tarde aprueba una prueba. Fundirlas es lo que hace hoy que el «visto bueno» no
signifique nada operativo.

---

## 7 · Orden de ataque

| | Qué | Por qué primero | Tamaño |
|---|---|---|---|
| 1 | Prensa al motor en la cotización | Es un subcosteo del 32% **medido**, hoy, en cada cotización que sale | 2 h |
| 2 | Clientes desde `clients` | No se le puede cotizar a un cliente nuevo | 1 h |
| 3 | `ot-spec.ts` + banda de precio | Es el cimiento de todo lo demás | 1 día |
| 4 | Nivel 1 completo en la cotización | Cierra la brecha barata | 1 día |
| 5 | Herencia VB → OT y recorrido de Pre-Prensa | Es el corazón del pedido | 2 días |
| 6 | Compuertas en la máquina de estados | Sin esto, lo anterior es una sugerencia | 1 día |
| 7 | Chips, columna y comparación | Lo hace visible | 1 día |
| 8 | Registro de maquetas en Pre-Prensa | El costo existe y hoy se disuelve | 1 día |

Los dos primeros se pueden hacer hoy y no dependen de nada.
