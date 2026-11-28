# Facturación electrónica con Nubox — lista para conectar

Estado al 2026-11-25: **construida y apagada.** El código emite facturas
electrónicas (DTE) por la API de Nubox, pero no lo hace hasta que se configure
`DTE_PROVIDER=nubox` con sus credenciales. Mientras tanto la app factura como
siempre: un registro interno que no llega al SII.

Decisión del dueño (2026-11-25): Nubox queda como integración futura, no bloquea
el lanzamiento.

## Qué API se usa y por qué

Nubox publica dos APIs en [developers.nubox.com](https://developers.nubox.com/api-docs):

| | API nueva "Factura y Administración" | API heredada |
| --- | --- | --- |
| Emisión | `POST {base}/v1/sales/issuance` | `POST api.nubox.com/Nubox.API…/emitir/ventaExtendido` |
| Credenciales | `Authorization` (Secret Key del partner) + `X-Api-Key` (de la empresa) | Usuario y clave → token de 15 min |
| Duplicados | `X-Idempotence-id`: la misma llave devuelve la respuesta original por 30 días | No hay |
| Lote | Hasta 50 documentos por llamada | Uno por llamada |
| Estado | Asíncrono, `GET /v1/sales/{id}` | `GET …/estadoventa/{folio}/{tipo}/{serie}` |

Se usa la **nueva**: la idempotencia hace que un corte de red nunca emita dos
facturas, y separar emitir de consultar es como el SII funciona de verdad.

## Cómo está armado

```
src/lib/dte/types.ts         Documento neutro (códigos SII), contrato DteProvider
src/lib/dte/validate.ts      Reglas del SII antes de llamar: RUT (módulo 11), giro, comuna, líneas
src/lib/dte/nubox.ts         Adaptador: toNuboxSale() (puro) + NuboxProvider (HTTP)
src/lib/dte/index.ts         getDteProvider(): null si está apagado o faltan credenciales
src/lib/dte/from-invoice.ts  Factura de la base → documento neutro
src/app/api/sales-invoices/[id]/dte   POST emite · GET consulta el estado
src/app/api/dte/status       Conexión + clientes sin giro/región/comuna
src/components/admin/FacturacionElectronicaCard.tsx   Tarjeta en Administración › Integraciones
supabase/migrations/20261125120000_la_factura_queda_lista_para_el_sii.sql
src/lib/__tests__/dte.test.ts  16 pruebas: RUT, validación, mapeo, cabeceras, 207/400, estado
```

Flujo de una factura:

1. Se registra como hoy (`POST /api/sales-invoices`): monto desde las guías, IVA 19 %.
2. `POST /api/sales-invoices/{id}/dte` arma el documento, lo valida y, si falta
   algo, contesta 422 con la lista en palabras ("Falta el giro de …").
3. Guarda la llave de idempotencia **antes** de llamar, llama a Nubox y deja la
   factura en `pending`. Nubox lo dice explícito: la respuesta de emisión no es
   la aceptación del SII.
4. `GET /api/sales-invoices/{id}/dte` consulta el estado y guarda `accepted` /
   `rejected` y el folio del SII.

Un rechazo estrena llave al reintentar (es un documento corregido). Un corte
de red reusa la misma llave y no puede duplicar.

## Para conectarlo — pasos

1. **Contratar / activar con Nubox** el acceso de partner a la API "Factura y
   Administración" para la empresa (RUT 83.383.100-3). Pedir:
   - la **URL base de certificación (UAT)** y la de producción (la
     documentación no las publica; las entrega soporte),
   - la **Secret Key del partner** y la **Api Key de la empresa**,
   - confirmación de que Nubox firma con el certificado digital y administra los
     folios (CAF).
2. **Aplicar la migración** `20261125120000` en la base de la nube (agrega giro,
   región y comuna al cliente, y los campos DTE a facturas y guías; todo
   opcional, no cambia nada de lo que existe).
3. **Completar los clientes**: Comercial › Clientes ahora pide giro, región y
   código de comuna. La tarjeta de Integraciones muestra cuáles faltan.
4. **Configurar en Vercel**, primero apuntando a certificación:
   `DTE_PROVIDER=nubox`, `NUBOX_BASE_URL`, `NUBOX_SECRET_KEY`, `NUBOX_API_KEY`.
5. **Probar en UAT** y cerrar los cuatro puntos marcados `VERIFICAR EN UAT` en
   `src/lib/dte/nubox.ts` (abajo).
6. **Agregar el botón "Enviar al SII"** en Despachos, que llama a la ruta del
   paso 2. Se dejó fuera a propósito: un botón que contesta "no conectado" en
   producción confunde más de lo que ayuda.
7. Cambiar `NUBOX_BASE_URL` a producción.

## Lo que la documentación no dice — se confirma en UAT

| # | Duda | Qué se asumió |
| --- | --- | --- |
| 1 | Forma de la respuesta de `GET /v1/sales/{id}`: la página sólo nombra los estados en prosa ("aceptado, rechazado o en espera") | Se leen `status`/`state`/`documentStatus` y `folio`/`number`/`documentNumber`, normalizados en `normalizeStatus` |
| 2 | Si `Authorization` lleva la Secret Key sola o con prefijo `Bearer` | Sola |
| 3 | Formato del RUT en `client.identification.value` | Sin puntos, con guion: `76543210-3` |
| 4 | Si el IVA sale de `subjectToTax` o hay que mandar `taxes[]` con `legalCode: "14"` | `subjectToTax`; la API heredada dice "el IVA es calculado automáticamente" |

Además: comparar el neto que calcula Nubox con el `net_amount` registrado. La
línea va con unidades × precio unitario con decimales, y el redondeo del
proveedor puede diferir en $1 (ya se ve esa diferencia en Despachos hoy).

## Fuera de esta etapa

- **Guía de despacho electrónica (52)**: el adaptador y la validación ya la
  soportan, y la migración agrega RUT de transportista y chofer y comuna de
  destino a la guía. Falta pedir esos datos en la pantalla de despacho.
- **Notas de crédito y débito (61, 56)**: soportadas por el adaptador; falta la
  pantalla para anular o corregir una factura emitida.
- **Exportación (110–112)**: el documento neutro no las modela todavía.
- **Lista de comunas**: hoy se escribe el código de 5 dígitos a mano; conviene
  un selector con las 346 comunas.

Las preguntas originales para Nubox siguen en
[nubox-facturacion-questions.md](nubox-facturacion-questions.md).
