# Nubox DTE (Facturación Electrónica) — information to gather

> Fill this in and I'll build the Nubox PSP adapter (factura + guía de despacho).
> Nothing here is needed to keep using the rest of the app — it only gates the
> billing module. Group A (access) + B (emisor) unblock the first working call.

## A. Nubox account & API access  *(blocking)*
1. Is **Nubox Facturación Electrónica (DTE)** active on your account, and is the
   **API / integration** module enabled? (Some plans require activating it.)
2. **API credentials**: client_id / client_secret (or API key / token). Where were
   they issued (Nubox panel → Integraciones/API)?
3. **Environment**: do you have a **certificación / sandbox** environment, or
   production only? (We build/test against sandbox first.)
4. The **empresa ID / RUT** as registered in Nubox.

## B. Emisor (your company) — SII data  *(blocking)*
5. RUT del emisor
6. Razón social
7. Giro + **código de actividad económica (SII)**
8. Dirección, comuna, ciudad
9. **N° y fecha de la Resolución SII** que autoriza emisión electrónica
10. Email de contacto / notificaciones
11. **Certificado digital (.pfx)** — does **Nubox hold it**, or do you provide it?
    (Usually Nubox manages signing — please confirm.)

## C. DTE types & folios
12. Which document types to enable:
    - [ ] Factura afecta (33)  - [ ] Factura exenta (34)
    - [ ] Nota de crédito (61) - [ ] Nota de débito (56)
    - [ ] **Guía de despacho (52)** (links lots → shipment)
    - [ ] **Factura de exportación (110/111/112)** for EU sales
13. Are **CAF / folios** managed automatically by Nubox, or do you load them?
14. Any internal **OT → factura numbering** to preserve, or follow Nubox's folios?

## D. Receptor (clientes)
15. We store client **name + RUT** today. For the DTE we also need **razón social,
    giro, dirección, comuna** per client — OK to add these fields and backfill?
16. **Clientes extranjeros (EU export)**: what receptor data does Nubox require
    (país, identificación fiscal/VAT, dirección)?

## E. Product / line mapping
17. How does an **OT map to factura lines** — one line per OT (description), or
    **itemized** (producto/SKU, cantidad, precio unitario)?
18. Do you use **Nubox product codes/SKUs**, or free-text descriptions?
19. **Pricing source**: where does the unit price / total come from — the
    cotización, `ot_financials.revenue`, manual entry?

## F. Taxes & export
20. **IVA 19%** standard — any **exempt** products or special taxes?
21. **Export DTEs**: moneda (USD/EUR), fuente del **tipo de cambio**, INCOTERM,
    país destino, cláusula de venta.
22. Any **retenciones** / withholdings?

## G. Operations & flow
23. **When is a factura emitted** — on OT completion, on delivery (guía), or
    manually from the app?
24. Do you emit a **guía de despacho** before the factura (lots → shipment)?
25. **Status sync**: should SII **acceptance/rejection** flow back into the app
    (Nubox webhook or polling)?
26. Store the DTE **PDF + XML** against the OT (so it joins the Expediente)?

---
**Minimum to start coding:** A1–A4 + B5–B11. The rest can follow as we build.
