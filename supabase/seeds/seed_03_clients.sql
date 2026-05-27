-- ============================================================
-- SEED 03 — Clients
-- 3 anchor clients (stress deadlines quarterly) +
-- 4 secondary regular clients
--
-- Run order: 03 of 07
-- Depends on: clients table (migration 20260303130000)
-- Safe to re-run: YES (ON CONFLICT DO NOTHING)
-- ============================================================

-- ── CLIENT ANATOMY ───────────────────────────────────────────
-- LabelCorp  → Pharma labels. Millions of units. Pantone-critical. On-time payer.
-- PackBrands → FMCG packaging. Premium quality. Fastest payer (net-15).
-- Distrib.   → Retail mass labels. Largest volume. ALWAYS late on art approval → chaos.
--
-- Every 3 months, all 3 trigger their quarterly orders in the SAME 3-week window.
-- That's the crunch: ~$245K extra revenue compressed into 18 working days.
--
-- TINKER TIP: Change Distribuidora payment_terms to '15 días' and watch
-- the cash-flow difference on the financial dashboard.

INSERT INTO clients
  (name, rut, contact_name, phone, email, address, city, payment_terms, notes, is_active)
VALUES
  -- ── LabelCorp S.A. ──────────────────────────────────────
  (
    'LabelCorp S.A.',
    '76.123.456-7',
    'Rodrigo Vidal',
    '+56 2 2345 6789',
    'operaciones@labelcorp.cl',
    'Av. Providencia 1234, Of. 501',
    'Santiago',
    '30 días',
    'Cliente farmacéutico ancla. Etiquetas para cadenas de distribución nacionales e internacionales. '
    'Requiere certificación de lote y trazabilidad ISO por cada OT. '
    'Pedidos trimestrales: 2.5–4M etiquetas adhesivas con Pantone crítico (485C rojo farmacia, 300C azul). '
    'Deadline FIJO por cadena de suministro — cualquier retraso genera multas al cliente. '
    'Pago puntual a 30 días. Margen: 30% (negociado por volumen). '
    'Contacto técnico arte: tecnico@labelcorp.cl | Teléfono emergencias: +56 9 9111 0001',
    true
  ),

  -- ── PackBrands Ltda. ────────────────────────────────────
  (
    'PackBrands Ltda.',
    '77.654.321-K',
    'Sofía Herrera',
    '+56 9 8765 4321',
    'compras@packbrands.cl',
    'Camino a Melipilla 4567, Nave 3',
    'Pudahuel',
    '15 días',
    'Cliente FMCG premium. Cajas plegadizas y etiquetas de alto tiraje. '
    'Colores Pantone críticos para identidad de marca (cada Pantone tiene Delta-E máx 1.5). '
    'Pago más rápido del portafolio: 15 días netos. Cliente ancla desde 2018. '
    'Pedidos trimestrales: 1.7–2.5M cajas + etiquetas. Requiere barniz UV selectivo en tapas. '
    'Margen: 35% (premium por calidad y velocidad de pago). '
    'Aprueba artes en 48h. Facilita la planificación. '
    'Contacto directo: sofia.herrera@packbrands.cl | Urgencias: +56 9 8765 0001',
    true
  ),

  -- ── Distribuidora Global ────────────────────────────────
  (
    'Distribuidora Global',
    '78.999.888-3',
    'Marco Sánchez',
    '+56 2 2987 6543',
    'pedidos@distglobal.cl',
    'Ruta 68 km 35, Bod. 7',
    'Pudahuel',
    '45 días',
    'Distribuidor retail masivo. Mayor volumen del portafolio: 3–6M etiquetas/trimestre. '
    'PROBLEMA CRÓNICO: aprueba artes con 5–10 días de retraso respecto al plazo acordado. '
    'Esto convierte sus OTs en urgentes en el peor momento del crunch. '
    'Pago lento: 45 días (impacta flujo de caja). '
    'Precio bajo por volumen → margen 28%. '
    'Producto simple (2 colores, adhesivo básico) pero volumen enorme. '
    'TINKER: cambiar payment_terms a 30 días para ver impacto en flujo. '
    'Contacto compras: marco.sanchez@distglobal.cl | Aprobación arte: arte@distglobal.cl',
    true
  ),

  -- ── Farmavida LTDA ──────────────────────────────────────
  (
    'Farmavida LTDA',
    '76.445.112-5',
    'Carmen Orozco',
    '+56 2 2456 7890',
    'pedidos@farmavida.cl',
    'Los Militares 6321, Of. 201',
    'Las Condes',
    '30 días',
    'Laboratorio farmacéutico mediano. Etiquetas de medicamentos OTC. '
    'Pedidos regulares 200–400K unidades/mes. Margen 40%. Cliente confiable.',
    true
  ),

  -- ── Comercial Norte S.A. ────────────────────────────────
  (
    'Comercial Norte S.A.',
    '76.778.334-8',
    'Diego Varela',
    '+56 2 2789 0123',
    'compras@comnorte.cl',
    'Av. Independencia 5678',
    'Santiago',
    '30 días',
    'Empresa alimentos y conservas. Etiquetas couche y adhesivas. '
    'Pedidos 150–350K unidades/mes. Margen 40%. Sin complicaciones.',
    true
  ),

  -- ── Inversiones del Sur Ltda. ───────────────────────────
  (
    'Inversiones del Sur Ltda.',
    '77.002.556-1',
    'Francisca Muñoz',
    '+56 9 7654 3210',
    'marketing@invdelsur.cl',
    'Av. Vicuña Mackenna 890',
    'Macul',
    '30 días',
    'Vinos, cervezas artesanales y bebidas premium. '
    'Etiquetas de alta calidad con troquelado especial, laminado y hot stamping ocasional. '
    'Pedidos 100–250K unidades/mes. Margen 45%. Clientes exigentes en diseño.',
    true
  ),

  -- ── Express Retail S.A. ─────────────────────────────────
  (
    'Express Retail S.A.',
    '76.101.202-9',
    'Andrés Toro',
    '+56 9 6543 2109',
    'ops@expressretail.cl',
    'Américo Vespucio Sur 1234',
    'Maipú',
    '15 días',
    'Retail masivo etiquetas genéricas, precio, oferta. '
    'Tiradas cortas urgentes: 100–500K unidades. Margen 40%. Pago rápido.',
    true
  )
ON CONFLICT (rut) WHERE rut IS NOT NULL AND rut <> '' DO NOTHING;
