# Guion de Demo — el hilo dorado en ~10 minutos

**Objetivo:** un pedido fluye VB → OT → OC → lote certificado → WhatsApp →
costos reales → expediente FSSC → despacho → factura → tracking del cliente,
en vivo, sin tocar la base de datos.

---

## Checklist de la mañana (15 min antes)

1. `node scripts/smoke.mjs` → **SMOKE GREEN** (si algo está rojo, no hay demo).
2. Re-ejecutar `scripts/seed-demo.sql` en el SQL Editor → fechas frescas
   ("firmado ayer", "sesión hace 2 horas"). Anota los números de OT del NOTICE.
3. Post-paso de foto (30 s): en `/operaciones/whatsapp`, simulador →
   mensaje `terminado <OT completada> foto del entregable` + URL de una foto
   real de etiqueta → el expediente queda COMPLIANT.
4. Tema claro, zoom 100%, sidebar colapsado. Cerrar la campanita.
5. Tener el teléfono a mano para abrir el link de tracking en pantalla.

## Acto 1 — La venta se convierte en orden (2 min)

- **/comercial/cotizaciones**: abrir **VB-09001** (firmado ayer por Viña
  Santa Elena). Mostrar líneas de estimación y precio.
- Clic **Convertir** → la app acuña el siguiente correlativo en vivo.
  *Frase: "cero re-tipeo: la cotización firmada ES la orden".*
- **/operaciones/kanban**: la OT nueva ya está en el tablero.

## Acto 2 — La planta habla por WhatsApp (3 min)

- Mostrar la **OT estrella** en columna Impresión — hover: máquina asignada,
  progreso, botón **Compartir**.
- **/operaciones/whatsapp**: cola de revisión con el FIN de ayer
  (62.000 pliegos, confianza 85%, costo inferido). **Aprobar** en vivo.
  *Frase: "el operario escribió un mensaje; el sistema entendió pliegos,
  merma y costo — el supervisor solo valida".*
- Simulador: enviar `Fin <OT estrella>, 30.000 pliegos, 200 de merma, entro
  la <OT convertida>` → **un** mensaje produce un FIN y un INICIO.
- Enviar una foto con caption → evidencia directa al expediente.

## Acto 3 — La trazabilidad que audita FSSC (2.5 min)

- **/operaciones/compras**: la OC de la estrella, recibida → abrir el lote
  **PEFC** con certificado vigente.
  *Frase: "recibir la OC creó el lote certificado Y el costo real de
  materiales — nadie tipeó un costo".*
- **/calidad/expediente** de la OT completada: insumos consumidos con
  certificado, aprobación de calidad, foto del entregable → **COMPLIANT**.
- **/calidad/recall**: buscar el lote PEFC → OTs y cliente afectados en
  segundos. *Frase: "el simulacro de retiro que FSSC exige: 30 segundos".*

## Acto 4 — La plata y el cliente (2 min)

- **/comercial/despachos + facturas**: GD-09001 despachada, FV-09001
  **pagada** (neto/IVA correctos).
- **/analitica/costos** de la OT estrella: estimado vs real en vivo.
- Cierre: botón **Compartir** en el kanban → abrir el link en el teléfono →
  el timeline acuarela de 5 fases que ve el cliente final.
  *Frase de cierre: "de un WhatsApp en el taller a esta pantalla en el
  teléfono del cliente — sin planillas, sin re-tipeo, con certificación".*

## Si algo falla (plan B)

- Simulador no responde → usar la cola de revisión ya sembrada (Acto 2 sigue).
- Convert falla → la OT estrella ya existe; saltar Acto 1 y narrarlo.
- Sin internet en el teléfono → abrir el tracking en otra pestaña.

## Post-demo

- Re-ejecutar la seed si se ensució la historia.
- Las filas [SMOKE] son del tripwire de CI — inofensivas, purgables.
