-- Una corrección del costo real se anula con un asiento contrario, no se borra.
--
-- B7 de plan.md (2026-11-27): la corrección manual entra al libro
-- (ot_cost_lines, source/ref_type 'correccion'). Quitarla con DELETE no dejaba
-- rastro: alguien podía cargar y borrar sin que nadie lo viera. Ahora se anula
-- con una línea espejo:
--   source   = 'anulacion'
--   ref_type = 'correccion'
--   ref_id   = la corrección que anula
--   quantity = −(la cantidad original), mismo costo unitario  ⇒ total opuesto
--   notes    = el motivo de la anulación
-- Las dos quedan; el neto es cero.
--
-- 1. La cantidad negativa se permitía sólo a la devolución de papel. Se
--    permite también a la anulación, y sólo si apunta a una corrección.
-- 2. Una corrección se anula una sola vez (índice único parcial): dos clics o
--    dos personas a la vez no pueden restarla dos veces.

ALTER TABLE public.ot_cost_lines DROP CONSTRAINT ot_cost_lines_quantity_check;
ALTER TABLE public.ot_cost_lines ADD CONSTRAINT ot_cost_lines_quantity_check CHECK (
  quantity >= 0
  OR source = 'devolucion'
  OR (source = 'anulacion' AND ref_type = 'correccion' AND ref_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ot_cost_lines_una_anulacion_por_correccion
  ON public.ot_cost_lines (ref_id)
  WHERE source = 'anulacion';
