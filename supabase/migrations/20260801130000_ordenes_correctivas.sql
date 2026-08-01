-- Órdenes de mantenimiento correctivas: las que nacen de algo roto.
--
-- `maintenance_work_orders.checklist_id` era NOT NULL, o sea que toda orden
-- tenía que seguir una pauta. Eso describe bien el mantenimiento PREVENTIVO y
-- no describe en absoluto el correctivo: "se cortó la mantilla del cuerpo 2,
-- cámbienla" no tiene checklist, tiene una falla.
--
-- Consecuencia práctica: las cinco máquinas de terminación no tienen ninguna
-- pauta cargada, así que una pieza vencida en la hotmelera no podía convertirse
-- en trabajo asignado a nadie. El módulo detectaba el problema y ahí se
-- terminaba.
--
-- Y 0 de las 39 órdenes existentes tienen `assigned_to`: se emiten y no son de
-- nadie.

ALTER TABLE public.maintenance_work_orders
  ALTER COLUMN checklist_id DROP NOT NULL;

ALTER TABLE public.maintenance_work_orders
  ADD COLUMN IF NOT EXISTS work_order_type TEXT NOT NULL DEFAULT 'preventivo'
    CHECK (work_order_type IN ('preventivo', 'correctivo', 'mejora')),
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS fault_description TEXT,
  -- Qué pieza y qué sistema. Es lo que cierra el circuito con Mecánica: una
  -- pieza vencida deja de ser una insignia en pantalla y pasa a ser trabajo.
  ADD COLUMN IF NOT EXISTS part_id UUID REFERENCES public.machine_parts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS system_id UUID REFERENCES public.machine_systems(id) ON DELETE SET NULL,
  -- Lectura del contador al emitir: permite saber después a cuántas
  -- impresiones/horas falló realmente la pieza, y corregir su vida útil.
  ADD COLUMN IF NOT EXISTS usage_at_creation NUMERIC;

COMMENT ON COLUMN public.maintenance_work_orders.work_order_type IS
  'preventivo sigue una pauta (checklist); correctivo nace de una falla y describe qué pasó; mejora es intervención planificada que no es ninguna de las dos.';
COMMENT ON COLUMN public.maintenance_work_orders.usage_at_creation IS
  'Contador de la máquina al emitir la orden. Comparado con last_replaced_usage de la pieza, dice a cuánto uso falló de verdad — que es como se corrige una vida útil mal estimada.';

-- Una orden preventiva sin pauta no se sabe qué hay que hacer; una correctiva
-- sin descripción de falla tampoco. Cada tipo exige lo suyo.
DO $$ BEGIN
  ALTER TABLE public.maintenance_work_orders
    ADD CONSTRAINT orden_describe_el_trabajo CHECK (
      (work_order_type = 'preventivo' AND checklist_id IS NOT NULL)
      OR (work_order_type <> 'preventivo' AND (title IS NOT NULL OR fault_description IS NOT NULL))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_work_orders_part ON public.maintenance_work_orders (part_id)
  WHERE part_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_abiertas ON public.maintenance_work_orders (machine_id, status)
  WHERE status IN ('pending', 'in_progress');
