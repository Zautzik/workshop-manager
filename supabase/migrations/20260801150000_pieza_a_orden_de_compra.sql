-- El vínculo que faltaba entre una pieza por comprar y la orden que la compra.
--
-- Mecánica sabía decir "esta mantilla se agota en 30 días y reponerla toma 45".
-- Y ahí terminaba: no había forma de que ese aviso se convirtiera en una compra,
-- ni de que la pieza supiera después que ya está pedida. El resultado es una
-- insignia roja que sigue gritando aunque el repuesto venga en camino — y una
-- alerta que no se puede apagar se deja de mirar.

ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS machine_part_id UUID
    REFERENCES public.machine_parts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_items_machine_part
  ON public.purchase_items (machine_part_id)
  WHERE machine_part_id IS NOT NULL;

COMMENT ON COLUMN public.purchase_items.machine_part_id IS
  'Qué pieza de qué máquina cubre esta línea. Permite que Mecánica muestre "ya pedida, llega el 12 de septiembre" en vez de seguir avisando que hay que pedirla.';

-- Qué piezas tienen una compra en curso. "En curso" es todo lo que no está
-- recibido ni cancelado: mientras el repuesto no esté en bodega, la pieza sigue
-- dependiendo de esa orden.
CREATE OR REPLACE VIEW public.machine_parts_on_order_v AS
SELECT
  pi.machine_part_id AS part_id,
  p.id               AS purchase_id,
  p.oc_number,
  p.supplier,
  p.status,
  p.purchase_date,
  p.expected_date,
  pi.quantity,
  pi.unit_cost
FROM public.purchase_items pi
JOIN public.purchases p ON p.id = pi.purchase_id
WHERE pi.machine_part_id IS NOT NULL
  AND p.status IN ('draft', 'sent');

COMMENT ON VIEW public.machine_parts_on_order_v IS
  'Piezas con compra en curso. Una pieza que ya está pedida no debería seguir apareciendo como "pedir ahora".';

GRANT SELECT ON public.machine_parts_on_order_v TO authenticated;
