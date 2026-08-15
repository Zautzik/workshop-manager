# Pre-Prensa y Visto Bueno

**Estado:** propuesta · 15 de agosto de 2026
**Por qué estas dos:** son las únicas etapas del flujo donde el trabajo todavía se
puede cambiar sin costo, y la única donde la responsabilidad cambia de manos.

---

## 1 · Lo que estas dos etapas son, en serio

Todo lo que pasa antes es reversible y barato. Todo lo que pasa después está
comprometido: comprado el papel y grabadas las planchas, un error se paga
reimprimiendo.

Entre medio hay dos cosas distintas que conviene no confundir:

**Pre-Prensa es un problema de COLA.** Un trabajo entra incompleto y sale
completo. Lo que importa no es qué le falta sino **hace cuánto que le falta** y
**quién lo debe**.

**El Visto Bueno es un problema de PRUEBA.** Es el único artefacto de toda la
aplicación que traslada responsabilidad: si el cliente aprobó un texto con una
errata, la reimpresión es suya. Ese valor entero depende de poder demostrar
**qué** se aprobó, **quién** lo aprobó y **cuándo**.

Hoy la app hace mal las dos cosas, y por razones opuestas: a Pre-Prensa le falta
tiempo, y al Visto Bueno le falta evidencia.

---

## 2 · Lo que ve cada disciplina

### El oficio · una sola aprobación, y por eso hay que saber qué frena

La primera versión de esta especificación proponía **tres** aprobaciones
separadas —contenido, color y estructura— porque así lo describe la literatura.
El dueño la corrigió:

> *Las aprobaciones son una sola. No existe eso de aprobación de color, de
> contenido y de estructura por separado: sólo entra a producción cuando las tres
> están confirmadas, así que en la práctica es un solo visto.*

Es correcto y simplifica el modelo: **una fila de aprobación por vuelta**, no
tres. La OT sale de `visto_bueno` cuando esa firma existe.

Lo que sí sobrevive de la observación es el **motivo del rechazo**. Cuando el
cliente NO aprueba, saber si fue por el texto, por el color o porque el envase no
arma es lo que decide a quién le rebota el trabajo — a diseño, a prensa o a
troquelado. Va en el rechazo, que es donde hay algo que enrutar, y no en la
aprobación, que es un sí y nada más.

Y una del oficio que la app ignora igual: **aprobar color en una pantalla no es
aprobar color.** Si lo que se manda es un PDF, lo que quedó aprobado no incluye
el color. Vale registrar contra qué se aprobó —PDF, prueba física, maqueta— en un
solo campo, porque es lo que se discute en la entrega.

### Lo contractual · `signed_by_name: 'Cliente'` no prueba nada

Es la línea más cara de la aplicación:

```ts
body: JSON.stringify({ status, signed_by_name: status === 'signed' ? 'Cliente' : undefined })
```

Un documento cuyo único propósito es servir de evidencia está guardando como
firmante la palabra «Cliente». Frente a un reclamo eso no sostiene nada: no dice
quién, no dice qué versión, no dice desde dónde.

Lo mínimo que un registro de aprobación tiene que fijar:

- **qué** — el archivo exacto, con su huella (`sha256`). Sin eso, «te aprobamos
  otra versión» es indefendible.
- **quién** — nombre, correo y cargo de quien apretó el botón.
- **cuándo** — sello de tiempo del servidor, no del navegador del cliente.
- **desde dónde** — IP y agente. No es paranoia: es lo que distingue una
  aprobación de una afirmación.

### Comercial · el visto bueno es donde se muere el plazo

Esto es lo que aportan los vendedores y lo que ninguna de las otras disciplinas
ve:

**a) La demora no la causa el cliente, la causa la fricción.** Una aprobación que
pide entrar a un sistema no se firma: se reenvía por correo, se imprime, se
escanea, y vuelve tres días después. La app ya tiene el vehículo —
`/track/[token]`, una página pública por OT— y no lo usa para esto.

**b) El costo de cada vuelta ya se calcula y nadie lo ve cuando decide.**
`maqueta.ts` sabe que una vuelta son ~$17.340 y tres son $52.020, con la mano de
obra pesando cuatro veces el material. Ese número tiene que estar **delante del
vendedor en el momento de mandar la segunda vuelta**, no en un informe a fin de
mes.

**c) Lo que mueve al cliente no es el precio, es la fecha.** «Cada día que la
prueba espera, la entrega se corre un día» es el único argumento que acelera una
aprobación, y la app tiene la fecha comprometida para poder decirlo con
números.

**d) El que aprueba no es el que compra.** El contacto comercial reenvía la
prueba a quien decide. Si el sistema sólo conoce al comprador, el vendedor no
sabe a quién apurar. Hay que poder mandar la prueba a un correo que no está en
la ficha del cliente.

### Operaciones · una compuerta sin reloj es una lista

Pre-Prensa hoy dice **qué falta**. No dice **hace cuánto** ni **quién lo debe**.
La consecuencia es que una OT a la que le falta el arte del cliente y otra a la
que le falta que el jefe de taller revise operaciones se ven idénticas, cuando
una se destraba con un llamado y la otra caminando diez metros.

Lo que una cola necesita para ser gobernable: **antigüedad**, **dueño del
pendiente** —adentro o afuera— y **el impacto en la fecha**.

### Calidad · la prueba aprobada es parte del expediente

Para envase de alimento la aprobación es documento de trazabilidad: hay que
poder recuperarla por lote, cinco años después, en una simulación de retiro.
Guardarla como una bandera en una fila no alcanza; el archivo tiene que estar y
tiene que poder recuperarse desde la OT.

---

## 3 · Lo que está roto hoy, medido

| | hecho verificado |
|---|---|
| `ot_approvals` | **0 filas.** La tabla existe desde hace meses y nadie la escribe |
| `ot_attachments` | **0 filas.** No hay dónde vive la prueba |
| firmante | la cadena literal `'Cliente'` |
| aprobación remota | `/track/[token]` existe y **no permite aprobar** |
| vueltas de prueba | no se cuentan; su costo se calcula pero no se registra por OT |
| antigüedad en Pre-Prensa | no se muestra |
| motivo del rechazo | no se registra: no se sabe a quién le vuelve el trabajo |
| contra qué se aprobó | no se registra: PDF y prueba física quedan iguales |

---

## 4 · El plan

### Fase A · Que Pre-Prensa sea una cola y no una lista

Barata y es la que más días recupera.

1. **Antigüedad por OT** — «hace 4 días acá», en rojo pasados los 3. Sale de
   `ot_status_history`, que ya se escribe.
2. **Dueño del pendiente** — cada hueco de `missingFor` se marca `interno` o
   `del cliente`. El arte es del cliente; el montaje y las operaciones son
   nuestros. Ordenar por eso convierte la pantalla en dos listas de llamados
   distintos.
3. **Impacto en la fecha** — «si sale hoy, entrega el 27; cada día que espera la
   corre uno». Con `deadline` y las horas estimadas ya se puede calcular.

**Prueba:** una OT esperando arte del cliente y otra esperando revisión interna
no aparecen en la misma agrupación.

---

### Fase B · Que el Visto Bueno sea evidencia

El corazón. Sin esto la etapa es decorativa.

1. **`ot_approvals` empieza a usarse**, con lo que le falta:

   ```sql
   decision      approved | rejected
   reject_reason text          -- sólo al rechazar: texto | color | estructura | otro
   proofed_on    text          -- contra qué se aprobó: pdf | prueba física | maqueta
   file_sha256   text          -- QUÉ se aprobó, sin ambigüedad
   approver_name text NOT NULL -- QUIÉN, de verdad
   approver_email text
   approver_role text          -- «regulatorio», «marca», «packaging»
   decided_at    timestamptz   -- reloj del servidor
   source_ip     inet
   round         integer       -- qué vuelta fue
   ```

2. **La prueba es un archivo con huella.** Se sube a `ot_attachments`, se calcula
   su `sha256` al guardarlo, y la aprobación apunta a esa huella. «Aprobamos otra
   versión» deja de ser discutible.

3. **Una aprobación por vuelta, y el motivo sólo al rechazar.** El sí es un sí; el
   no necesita decir si fue texto, color o estructura, que es lo que determina a
   quién le vuelve el trabajo.

4. **La compuerta se conecta.** `validateTransition` ya rechaza
   `visto_bueno → paper_purchase` sin aprobación; hoy lee `ot_approvals`, que
   está vacía, así que nunca se probó contra datos reales.

**Prueba:** no se puede aprobar sin nombre real · la huella del archivo aprobado
queda guardada · un rechazo sin motivo no se guarda · una OT sin aprobación no
pasa a compra de papel.

---

### Fase C · Que el cliente pueda aprobar sin cuenta

Donde se recuperan los días.

1. **`/track/[token]` gana el botón de aprobar.** El token ya existe por OT.
   Formulario mínimo: nombre, correo, cargo, y aprobar o rechazar con comentario.
2. **Rechazar pide el motivo y lo ata a la vuelta.** Es lo que después permite
   decir «este cliente rechaza tres veces por contenido» y cobrarlo o corregirlo.
3. **Enviar a un correo que no está en la ficha.** El que aprueba rara vez es el
   contacto comercial.
4. **El enlace muestra la fecha en juego** — «aprobando hoy, entregamos el 27».

**Cuidado que no se puede saltear:** un token que aprueba es un token que
compromete plata. Necesita caducidad, un solo uso por vuelta, y que rechazar no
sea posible después de aprobado.

---

### La maqueta es opcional, y tiene que seguir siéndolo

El taller hace una variedad grande de trabajos y **la maqueta no aplica a todos**:
un estuche nuevo la pide, una reimpresión de etiqueta no. El registro ya es
opcional —se abre desde un botón y no bloquea nada— y esa decisión se mantiene a
propósito:

- **no es un requisito** de nivel 2: una OT sin maqueta puede mandar la prueba
- **no tiene forma fija**: las vueltas se agregan de a una, con sus pliegos y sus
  horas, y no hay una plantilla que imponga cuántas ni de qué tamaño
- **el troquel de muestra es aparte** y no se repite entre vueltas

Lo que falta es que se pueda **declarar que no lleva** —distinto de «nadie la
cargó todavía»—, que es la diferencia entre un dato faltante y una decisión
tomada. Es la misma forma que `sin_arte`, que ya funciona así.

### Fase D · Que cada vuelta se vea y se cuente

1. **Contador de vueltas por OT**, visible en Pre-Prensa y en la ficha del
   cliente.
2. **El costo acumulado de las maquetas al lado del botón de mandar la vuelta
   siguiente.** Ya se calcula; falta ponerlo donde se decide.
3. **`maquetaLoadByClient` en el panel de rentabilidad por cliente.** Un cliente
   que pide tres vueltas y aprueba a la tercera puede dejar menos que uno que
   paga menos y aprueba a la primera — y hoy los dos se ven iguales.

---

## 5 · Orden y tamaño

| | fase | por qué en ese orden | tamaño |
|---|---|---|---|
| 1 | A — antigüedad y dueño | recupera días sin tocar el esquema | 1 día |
| 2 | B — evidencia | sin esto la etapa no sirve para lo que existe | 2–3 días |
| 3 | C — aprobación remota | es donde están los días, pero necesita B | 2 días |
| 4 | D — vueltas y costo | mejora decisiones; no bloquea nada | 1 día |

---

## 6 · Lo que hay que preguntarle al taller

Ninguna de estas la puede contestar el código:

- ¿Se manda prueba **física** o basta el PDF? Cambia el costo y el plazo de cada
  vuelta.
- ¿Cuántas vueltas se aceptan **antes de cobrarlas**? Es una política comercial y
  hoy no existe.
- ¿Quién firma del lado del cliente, por tipo de trabajo? En envase de alimento
  casi siempre hay un tercero regulatorio.
- ¿Qué se hace cuando el cliente aprueba y después pide un cambio? Es el caso que
  más discute y el que la app tiene que dejar registrado.
