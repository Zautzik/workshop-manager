# Órdenes de compra y facturas

**Estado:** propuesta · 15 de agosto de 2026
**Por qué ahora:** entre Compra de Papel y En Bodega la aplicación pide «registro
de costos reales». Lo que realmente ocurre ahí es que **se emite un documento y
se recibe otro**, y los dos tienen valor legal y valor de certificación.

---

## 1 · Lo que ya está construido y nadie usa

Verificado en el repositorio, no supuesto:

| pieza | estado |
|---|---|
| `purchases` · `purchase_items` | tablas creadas |
| `purchase_invoices` · `oc_billing` | tablas creadas |
| `receive_oc_into_lot(...)` | función en la base, acepta `lot_number`, `cert_code`, `cert_expires` |
| `/api/purchases` · `/api/purchases/[id]` | endpoints |
| `/api/purchases/[id]/receive` | endpoint |
| `/api/purchases/[id]/invoices` | endpoint |
| **pantallas que los usan** | **ninguna** |

La cadena entera existe del lado del servidor. Una búsqueda por esas tablas en
`src/app` y `src/components` devuelve únicamente las propias rutas de API.

Es el patrón que este proyecto lleva meses cerrando en su forma más pura: **el
dato existe, nadie lo consulta**. Y acá el costo no es de prolijidad — es que la
trazabilidad que exige la certificación nunca llega a formarse.

---

## 2 · Qué significa «grado elite» para estos dos documentos

No es una interfaz más linda. Son cuatro propiedades que un documento legal
tiene o no tiene.

### a) Inmutable

Un documento que se puede editar no es un documento. Una vez **emitida**, una OC
no se modifica: se anula con motivo y autor, o se corrige con una nota de
crédito. El `UPDATE` silencioso es la operación que destruye el valor probatorio
de todo el registro.

En la práctica: `status` con `borrador → emitida → recibida → facturada →
cerrada`, y `anulada` como salida lateral. Sólo `borrador` acepta ediciones. Un
disparador rechaza cualquier cambio de campos económicos fuera de ese estado.

### b) Correlativa y sin huecos

Una numeración con saltos es la primera pregunta de cualquier auditoría. El
número lo asigna **la base** con una secuencia, nunca la aplicación — dos
pestañas abiertas asignando el mismo número es un problema de concurrencia que
sólo la base sabe resolver.

Un documento anulado **conserva su número**. Se anula, no se borra: el hueco es
peor que el error.

### c) Atribuida

Quién la emitió, quién la recibió, quién la facturó — con reloj del servidor.
Son tres personas distintas en un taller que funciona, y esa separación es
control interno, no burocracia: **quien pide no debería ser quien recibe**.

### d) Conciliada — el calce a tres bandas

Es el corazón, y es donde se pierde plata en silencio:

```
        OC (lo que pedí)
          ↕
   RECEPCIÓN (lo que llegó)
          ↕
     FACTURA (lo que me cobran)
```

Rara vez coinciden. Llegan 480 pliegos de 500; facturan 500. La aplicación tiene
que **mostrar la diferencia y exigir que alguien la explique** antes de dar la
factura por buena. Hoy esa diferencia se absorbe sin que nadie la vea.

---

## 3 · Lo que agrega la certificación

FSSC 22000 para envase de alimento convierte esto de contabilidad en
trazabilidad. Cuatro requisitos que el diseño tiene que soportar:

**1 · Del lote hacia atrás y hacia adelante.** Desde un pliego consumido en una
OT hay que poder llegar al lote, del lote a la OC, de la OC al proveedor y a su
certificado. Y al revés: dado un lote sospechoso, qué OT lo usaron y a qué
clientes se despachó. `receive_oc_into_lot` ya acepta los campos; falta que
alguien los cargue.

**2 · Certificado vigente, verificado al recibir.** Un certificado de aptitud
alimentaria vencido hace que el material **no se pueda usar**, no que quede
anotado. La recepción tiene que rechazar —o exigir desvío autorizado— cuando
`cert_expires` ya pasó. Es el control que convierte el campo en una barrera.

**3 · Proveedor aprobado.** No se le compra a cualquiera: hay una lista de
proveedores evaluados. `supplier_profiles` y `supplier_categories` ya existen.
La OC tiene que verificar el estado del proveedor al emitirse.

**4 · Simulacro de retiro en horas, no en días.** El criterio real de la
auditoría: reconstruir la cadena completa de un lote en menos de cuatro horas.
Si eso requiere abrir carpetas de papel, la certificación no se sostiene. Ya
existe `/api/ots/[id]/dossier` y una ruta `recall`; les falta esta mitad.

**5 · Retención cinco años.** Nada se borra. Lo que ya está resuelto por el
principio de inmutabilidad, si se respeta.

---

## 4 · El flujo, paso a paso

Reemplaza al diálogo de costos reales en la transición **Compra de Papel → En
Bodega**.

### Paso 1 · Emitir la OC

Nace desde la OT, así que hereda qué papel y cuánto — sin volver a tipear lo que
Pre-Prensa ya definió.

- proveedor (sólo de la lista de aprobados)
- líneas: material, cantidad, precio unitario, unidad
- condiciones de pago y fecha comprometida
- **al emitir:** número correlativo de la base, sello de tiempo, autor, y la OC
  queda cerrada a edición

*Prueba:* una OC emitida no acepta cambios de precio ni cantidad · dos emisiones
simultáneas no comparten número · un proveedor no aprobado no deja emitir.

### Paso 2 · Recibir contra la OC

Lo que llega, no lo que se pidió.

- cantidad real recibida, por línea
- **número de lote del proveedor** — el eslabón de toda la trazabilidad
- **certificado y vencimiento**, con bloqueo si está vencido
- quién recibió
- la diferencia contra lo pedido se muestra y, si supera una tolerancia, pide
  motivo

Recién acá la OT pasa a **En Bodega**: el estado sigue al hecho físico, no al
clic.

*Prueba:* recibir 480 de 500 deja la OC parcialmente recibida y visible · un
certificado vencido no deja recibir sin autorización explícita · el lote queda
consultable desde la OT que lo consume.

### Paso 3 · Registrar la factura

- folio, fecha de emisión, RUT del emisor
- neto, IVA, total — **calculados y verificados**, no tipeados a mano
- se ata a la OC
- **el calce a tres bandas se muestra al guardar**: pedido / recibido /
  facturado, con la diferencia destacada
- una diferencia sin explicación deja la factura *en revisión*, no aprobada

*Prueba:* una factura cuyo total no cuadra con neto + IVA no se guarda · una
factura por más de lo recibido queda en revisión · no se puede pagar una factura
en revisión.

---

## 5 · Lo que hay que agregar al esquema

Sobre lo que ya existe, no en vez de:

```sql
purchases
  oc_number      TEXT UNIQUE      -- de una secuencia, no de la aplicación
  status         borrador|emitida|recibida|facturada|cerrada|anulada
  issued_by      UUID NOT NULL    -- al emitir
  issued_at      TIMESTAMPTZ
  voided_reason  TEXT             -- anular exige motivo
  voided_by      UUID

purchase_receipts                 -- la recepción es un hecho propio
  purchase_item_id, quantity_received,
  lot_number, cert_code, cert_expires,
  received_by, received_at, variance_reason

purchase_invoices
  folio, issuer_rut, net, vat, total,
  match_status   ok|en_revision|con_diferencia,
  match_notes
```

Y las reglas en la base, no sólo en la API: `CHECK` sobre el cuadre aritmético,
disparador que impide `UPDATE` de campos económicos fuera de `borrador`, y
`UNIQUE` sobre folio por emisor.

---

## 6 · Orden

| | qué | por qué primero | tamaño |
|---|---|---|---|
| 1 | Pantalla de OC + emisión inmutable | sin la OC no hay contra qué conciliar | 2 días |
| 2 | Recepción con lote y certificado | acá se forma la trazabilidad | 2 días |
| 3 | Factura + calce a tres bandas | donde se recupera la plata | 2 días |
| 4 | Reemplazar el diálogo del Kanban | conecta todo al flujo real | medio día |
| 5 | Simulacro de retiro desde el lote | el criterio de la auditoría | 1 día |

---

## 7 · Lo que hay que preguntarle al taller

- ¿Qué tolerancia de recepción se acepta sin autorización? (±2%, ±5%)
- ¿Quién puede emitir una OC y hasta qué monto?
- ¿Quién recibe? ¿Es distinto del que pide? *(debería serlo)*
- ¿Se trabaja con órdenes abiertas —un precio pactado y despachos parciales—
  o cada compra es una OC?
- ¿Los certificados de aptitud alimentaria llegan por lote o por proveedor?
