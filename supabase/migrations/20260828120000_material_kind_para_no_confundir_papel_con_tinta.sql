-- Qué FAMILIA de material es un ítem — no cuán durable es.
--
-- `inventory_items.category` ya existe (tool | supply | product_input |
-- spare_part) y contesta una pregunta distinta: si el ítem se consume por
-- trabajo o es una herramienta/repuesto que se reusa. Papel y tinta son
-- los dos `product_input` — la categoría no alcanza para separarlos, y sin
-- esa separación no hay forma de decir "de bodega, a esta etapa sale sólo
-- el papel" sin adivinar por el nombre del ítem.
--
-- El vocabulario es el mismo que ya usa ot_requirements.kind (papel,
-- tinta_especial, envase, servicio, insumo, herramental, otro) — un ítem
-- del catálogo y un requisito de Compras están describiendo la misma
-- familia de cosas, y tener dos nombres para eso sería la clase de "dos
-- puertas" que este repositorio viene cerrando desde hace meses.
--
-- TEXT + CHECK, no un enum: agregar una familia nueva el día de mañana no
-- debería pedir una migración de tipo — sólo una fila más en el CHECK.

BEGIN;

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS material_kind TEXT;

DO $$ BEGIN
  ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_material_kind_valido
    CHECK (material_kind IS NULL OR material_kind IN
      ('papel', 'tinta_especial', 'envase', 'servicio', 'insumo', 'herramental', 'otro'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_items_material_kind
  ON public.inventory_items(material_kind);

COMMENT ON COLUMN public.inventory_items.material_kind IS
  'Familia de material (papel, tinta_especial, envase, ...) — mismo vocabulario que ot_requirements.kind. Nulo = sin clasificar, se trata como "no es papel" en cualquier filtro que dependa de esto.';

-- ── Backfill: los 37 ítems que hay hoy, clasificados uno por uno por SKU ────
--
-- No por un patrón sobre el nombre: un ítem nuevo con un nombre ambiguo
-- clasificado mal por una heurística es peor que uno sin clasificar, porque
-- el sin clasificar al menos se nota. Cada SKU de acá se revisó a mano
-- contra el catálogo real (auditoría 2026-08).

-- Papel y sustratos — incluye los adhesivos: son couché/cartulina con
-- respaldo adhesivo, siguen siendo el sustrato que se imprime.
UPDATE public.inventory_items SET material_kind = 'papel'
 WHERE sku IN (
   '2112', 'DEMO-ADH-090', 'PAP-BOND-75', 'PAP-COUCH-150', 'PAP-KRAFT-120',
   'SUB-ADH-060', 'SUB-ADH-080', 'SUB-BON-080',
   'SUB-CAR-300', 'SUB-CAR-350', 'SUB-CAR-400',
   'SUB-COU-115', 'SUB-COU-150'
 );

-- Tintas, todas las variantes (CMYK, Pantone, y las de nombre suelto).
UPDATE public.inventory_items SET material_kind = 'tinta_especial'
 WHERE sku IN (
   'INK-BLK-01', 'INK-CMYK-C', 'INK-CMYK-K', 'INK-CMYK-M', 'INK-CMYK-Y',
   'INK-CYAN-01', 'INK-MAG-01', 'INK-PAN-300C', 'INK-PAN-375C', 'INK-PAN-485C',
   'INK-YEL-01'
 );

-- Embalaje y despacho.
UPDATE public.inventory_items SET material_kind = 'envase'
 WHERE sku IN ('EMB-BOX-LG', 'EMB-BOX-SM', 'EMB-CORES', 'EMB-STRETCH');

-- Todo lo demás que hoy existe: repuestos de máquina, solventes, planchas,
-- foil y film de terminaciones. Ninguno es papel, tinta ni embalaje — y
-- ninguno tiene todavía una familia más específica que valga la pena crear
-- para un solo ítem cada una.
UPDATE public.inventory_items SET material_kind = 'insumo'
 WHERE sku IN (
   'CON-BLK-OFF', 'CON-SOL-OFF', 'FIN-ADH-TAPE', 'FIN-FILM-LAM', 'FIN-FOIL-GLD',
   'MNT-RODILLO-01', 'PLT-ALUM-01', 'PLT-CTP-4UP', 'SOL-LAVADO-01'
 );

COMMIT;
