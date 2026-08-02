-- P1 · Una sola verdad de costo: migrar ot_financials al ledger.
--
-- SITUACIÓN. La vista `ot_cost_summary` está bien construida: filtra por `kind`
-- y sólo suma 'actual' para el costo real. El problema no es la vista — es que
-- de 654 líneas del ledger sólo 36 son 'actual', así que reporta casi cero
-- costo mientras `ot_financials` sí tiene cifras. Por eso las dos fuentes
-- discrepaban en 85 de 85 OTs: no se contradicen, una está vacía.
--
-- QUÉ RESULTÓ SER `ot_financials`. Se conservó la duda de Diego —"puede que ahí
-- viva el histórico de 2025 y no haya backfill"— y se fue a mirar antes de
-- tocar nada. No hay histórico de 2025:
--
--   · las 60+ filas de la serie OT-2025-xxx / OT-2026-xxx se crearon TODAS el
--     2026-05-19, en un solo lote
--   · usan el formato OT-AAAA-NNN, anterior a la numeración real del taller
--     (405xx, dígitos puros, commit 00064a5)
--   · el desglose es proporcionalmente idéntico fila a fila —material ≈32%,
--     mano de obra ≈22%, máquina ≈10% del precio— lo que no ocurre en trabajos
--     reales, sólo en datos generados
--
-- Así que no se borra nada, pero tampoco se le miente al ledger: lo sembrado
-- entra marcado como `source='seed'` y lo demás como `source='legacy'`, para
-- que la analítica pueda excluir la ficción sin perder el rastro.
--
-- SIN DOBLE CONTEO. Se omite cualquier (ot_id, categoría) que ya tenga una
-- línea 'actual', y se omite lo ya migrado — la migración es idempotente.

INSERT INTO public.ot_cost_lines
  (ot_id, kind, category, description, quantity, unit, unit_cost, source, occurred_at, notes)
SELECT
  f.ot_id,
  'actual'::public.cost_line_kind,
  m.categoria::public.cost_line_category,
  m.etiqueta,
  1,
  'global',
  m.monto,
  -- La serie sembrada se marca distinto: es rastreable pero excluible.
  CASE WHEN o.ot_number LIKE 'OT-%' THEN 'seed' ELSE 'legacy' END,
  COALESCE(f.created_at, now()),
  'Migrado desde ot_financials (auditoría 2026-08, P1)'
FROM public.ot_financials f
JOIN public.ots o ON o.id = f.ot_id
CROSS JOIN LATERAL (
  VALUES
    ('material',   'Material (migrado)',       f.material_cost),
    ('labor',      'Mano de obra (migrado)',   f.labor_cost),
    ('machine',    'Máquina (migrado)',        f.machine_cost),
    -- La energía es costo de máquina en el modelo de este taller: la hora de
    -- máquina ya la incorpora (ver machine-economics.ts).
    ('machine',    'Energía (migrado)',        f.energy_cost),
    ('outsourced', 'Servicios externos (migrado)', f.outsourcing_cost),
    ('overhead',   'Gastos generales (migrado)',   f.overhead_cost)
) AS m(categoria, etiqueta, monto)
WHERE m.monto IS NOT NULL
  AND m.monto > 0
  -- No duplicar lo que el ledger ya tiene como real en esa categoría.
  AND NOT EXISTS (
    SELECT 1 FROM public.ot_cost_lines existente
     WHERE existente.ot_id = f.ot_id
       AND existente.kind = 'actual'
       AND existente.category = m.categoria::public.cost_line_category
  )
  -- Idempotencia: no re-migrar.
  AND NOT EXISTS (
    SELECT 1 FROM public.ot_cost_lines ya
     WHERE ya.ot_id = f.ot_id
       AND ya.source IN ('legacy', 'seed')
       AND ya.category = m.categoria::public.cost_line_category
  );

-- Marcar la tabla como cerrada a escrituras nuevas. No se elimina: queda como
-- registro de la migración y como red por si el conteo no cuadra.
COMMENT ON TABLE public.ot_financials IS
  'MIGRADA a ot_cost_lines el 2026-08-01 (P1 de la auditoría de Analítica). Ningún código debe leerla ni escribirla. Se conserva sólo como respaldo de la migración; la verdad de costo es ot_cost_lines + la vista ot_cost_summary.';
