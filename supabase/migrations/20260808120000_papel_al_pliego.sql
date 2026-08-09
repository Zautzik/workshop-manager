-- El papel se convierte a pliego, y el pliego es lo que la máquina procesa.
--
-- Una imprenta compra el papel como se lo venden —por kilo, por resma— pero
-- produce y cobra en pliegos: la prensa y la guillotina se pagan por hora y su
-- rendimiento se mide en pliegos por hora. El pliego es donde se encuentran las
-- dos mitades del costo:
--
--     pliegos × $/pliego                 → material
--     pliegos ÷ pliegos-hora × $/hora    → máquina
--
-- Hasta ahora esa conversión no existía. `inventory_items` no guardaba ni las
-- medidas del pliego ni el gramaje, así que kg, resma y unidad entraban todos
-- al motor como `substrate_per_kg` sin traducir: un precio por resma se cobraba
-- como si fuera por kilo.
--
-- Esta migración agrega la geometría que falta y corrige la siembra, que se
-- generó sin criterio y dejó el mismo material dos veces a escalas distintas
-- (cartulina a $2.800/kg en el catálogo y a $3,20/kg en los lotes).

BEGIN;

-- ── 1. La geometría del pliego ──────────────────────────────────────────────
-- Sin esto no hay conversión posible: el peso de un pliego es su superficie por
-- su gramaje, no una constante.

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS sheet_width_cm   numeric,
  ADD COLUMN IF NOT EXISTS sheet_height_cm  numeric,
  ADD COLUMN IF NOT EXISTS grammage_gsm     integer,
  -- Pliegos por paquete cuando se compra por resma. 500 es convención de la
  -- industria, pero hay proveedores que despachan de 250.
  ADD COLUMN IF NOT EXISTS sheets_per_package integer;

COMMENT ON COLUMN public.inventory_items.sheet_width_cm IS
  'Ancho del pliego en cm. Con alto y gramaje permite convertir kg ↔ pliego.';
COMMENT ON COLUMN public.inventory_items.sheets_per_package IS
  'Pliegos por resma/paquete. NULL = 500 (convención).';

-- ── 2. Sustratos: geometría y precio coherentes ─────────────────────────────
-- Formato estándar de pliego 70×100 salvo los adhesivos en bobina, que se
-- compran por kilo y no tienen pliego fijo.
--
-- Los precios son los del catálogo de costeo (`cost_catalog`), que son los que
-- tienen escala de pesos chilenos reales. Los de la siembra —cartulina a $3,20
-- el kilo, couché a $1,95— quedaban tres órdenes de magnitud abajo.

UPDATE public.inventory_items SET
  sheet_width_cm = 70, sheet_height_cm = 100, grammage_gsm = 300,
  unit = 'kg', estimated_unit_cost = 2800
 WHERE sku = 'SUB-CAR-300';

UPDATE public.inventory_items SET
  sheet_width_cm = 70, sheet_height_cm = 100, grammage_gsm = 350,
  unit = 'kg', estimated_unit_cost = 3000
 WHERE sku = 'SUB-CAR-350';

UPDATE public.inventory_items SET
  sheet_width_cm = 70, sheet_height_cm = 100, grammage_gsm = 400,
  unit = 'kg', estimated_unit_cost = 3200
 WHERE sku = 'SUB-CAR-400';

UPDATE public.inventory_items SET
  sheet_width_cm = 70, sheet_height_cm = 100, grammage_gsm = 115,
  unit = 'kg', estimated_unit_cost = 1750
 WHERE sku = 'SUB-COU-115';

UPDATE public.inventory_items SET
  sheet_width_cm = 70, sheet_height_cm = 100, grammage_gsm = 150,
  unit = 'kg', estimated_unit_cost = 1900
 WHERE sku = 'SUB-COU-150';

-- Bond en resma: 500 pliegos de 70×100 a 80 g pesan 28 kg. A $1.150/kg la
-- resma sale $32.200 — que es el precio con el que se compra, no un invento.
UPDATE public.inventory_items SET
  sheet_width_cm = 70, sheet_height_cm = 100, grammage_gsm = 80,
  unit = 'resma', sheets_per_package = 500, estimated_unit_cost = 32200
 WHERE sku = 'SUB-BON-080';

UPDATE public.inventory_items SET
  sheet_width_cm = 70, sheet_height_cm = 100, grammage_gsm = 75,
  unit = 'resma', sheets_per_package = 500, estimated_unit_cost = 30200
 WHERE sku = 'PAP-BOND-75';

UPDATE public.inventory_items SET
  sheet_width_cm = 70, sheet_height_cm = 100, grammage_gsm = 150,
  unit = 'resma', sheets_per_package = 500, estimated_unit_cost = 59900
 WHERE sku = 'PAP-COUCH-150';

-- Adhesivos en bobina: se compran por kilo y no tienen pliego. Se les deja el
-- gramaje —sirve para calcular consumo— y sin medidas de pliego, que es la
-- forma honesta de decir «esto no viene en pliegos».
UPDATE public.inventory_items SET grammage_gsm = 60, unit = 'kg', estimated_unit_cost = 1900 WHERE sku = 'SUB-ADH-060';
UPDATE public.inventory_items SET grammage_gsm = 80, unit = 'kg', estimated_unit_cost = 2150 WHERE sku = 'SUB-ADH-080';
UPDATE public.inventory_items SET grammage_gsm = 90, unit = 'kg', estimated_unit_cost = 3500 WHERE sku = 'DEMO-ADH-090';

-- ── 3. Tintas: una sola escala ──────────────────────────────────────────────
-- Convivían INK-CMYK-* a $12,5/kg con INK-*-01 a $18.500/kg: la misma tinta,
-- mil quinientas veces de diferencia. La escala buena es la segunda.
UPDATE public.inventory_items SET unit = 'kg', estimated_unit_cost = 16000 WHERE sku IN ('INK-CMYK-K', 'INK-BLK-01');
UPDATE public.inventory_items SET unit = 'kg', estimated_unit_cost = 18500 WHERE sku IN ('INK-CMYK-C', 'INK-CMYK-M', 'INK-CMYK-Y', 'INK-CYAN-01', 'INK-MAG-01', 'INK-YEL-01');
UPDATE public.inventory_items SET unit = 'kg', estimated_unit_cost = 26000 WHERE sku LIKE 'INK-PAN-%';

-- ── 4. Planchas: la CTP graba una plancha por color y por pliego ────────────
-- PLT-CTP-4UP estaba a $18,19 y PLT-ALUM-01 a $9.500. Misma plancha.
UPDATE public.inventory_items SET unit = 'unit', estimated_unit_cost = 8500
 WHERE sku IN ('PLT-CTP-4UP', 'PLT-ALUM-01');

-- ── 5. Consumibles y embalaje ───────────────────────────────────────────────
UPDATE public.inventory_items SET unit = 'unit',  estimated_unit_cost = 1200  WHERE sku = 'EMB-BOX-SM';
UPDATE public.inventory_items SET unit = 'unit',  estimated_unit_cost = 1900  WHERE sku = 'EMB-BOX-LG';
UPDATE public.inventory_items SET unit = 'unit',  estimated_unit_cost = 900   WHERE sku = 'EMB-CORES';
UPDATE public.inventory_items SET unit = 'rollo', estimated_unit_cost = 5200  WHERE sku = 'EMB-STRETCH';
UPDATE public.inventory_items SET unit = 'rollo', estimated_unit_cost = 2800  WHERE sku = 'FIN-ADH-TAPE';
UPDATE public.inventory_items SET unit = 'kg',    estimated_unit_cost = 6500  WHERE sku = 'FIN-FILM-LAM';
UPDATE public.inventory_items SET unit = 'm2',    estimated_unit_cost = 8500  WHERE sku = 'FIN-FOIL-GLD';
UPDATE public.inventory_items SET unit = 'litro', estimated_unit_cost = 4200  WHERE sku = 'CON-SOL-OFF';
UPDATE public.inventory_items SET unit = 'unit',  estimated_unit_cost = 95400 WHERE sku = 'CON-BLK-OFF';

-- ── 6. Los lotes se alinean con su material ─────────────────────────────────
-- Los lotes son la fuente del costo ponderado, que es lo que el motor prefiere.
-- Traían la escala vieja, así que se reescalan al precio del material. Se
-- conserva la proporción entre lotes del mismo item —un lote más caro sigue
-- siendo más caro— pero se lleva la escala a pesos reales.

UPDATE public.inventory_lots l
   SET unit_cost = ROUND(
         (l.unit_cost / NULLIF(prom.promedio, 0)) * i.estimated_unit_cost, 2)
  FROM public.inventory_items i,
       (SELECT item_id, AVG(unit_cost) AS promedio
          FROM public.inventory_lots
         GROUP BY item_id) prom
 WHERE i.id = l.item_id
   AND prom.item_id = l.item_id
   AND prom.promedio > 0
   AND i.estimated_unit_cost > 0
   -- Sólo los que están fuera de escala: si el lote ya ronda el precio del
   -- material, es un precio real de compra y no se toca.
   AND (l.unit_cost < i.estimated_unit_cost / 10 OR l.unit_cost > i.estimated_unit_cost * 10);

-- ── 7. Velocidades de máquina ───────────────────────────────────────────────
-- Sin pliegos-hora no hay forma de convertir un tiraje en horas, y sin horas no
-- hay costo de máquina. Sólo las dos Ryobi las traían.
--
-- La óptima es la que se usa para costear: la nominal es la de catálogo del
-- fabricante, que ninguna prensa sostiene con papel real y arreglo.

UPDATE public.machines SET nominal_speed_sheets_hr = 13000, optimal_speed_sheets_hr = 9000 WHERE name = 'Roland 300';
UPDATE public.machines SET nominal_speed_sheets_hr =  1800, optimal_speed_sheets_hr = 1400 WHERE type = 'digital_printer';
UPDATE public.machines SET nominal_speed_sheets_hr =  4000, optimal_speed_sheets_hr = 2800 WHERE type = 'guillotine' AND optimal_speed_sheets_hr IS NULL;
UPDATE public.machines SET nominal_speed_sheets_hr =  5000, optimal_speed_sheets_hr = 3500 WHERE type = 'die_cutter';
UPDATE public.machines SET nominal_speed_sheets_hr =  6000, optimal_speed_sheets_hr = 4200 WHERE type = 'folder';
UPDATE public.machines SET nominal_speed_sheets_hr =  3000, optimal_speed_sheets_hr = 2200 WHERE type IN ('collator', 'stitcher', 'perfect_binder');
UPDATE public.machines SET nominal_speed_sheets_hr =  2500, optimal_speed_sheets_hr = 1800 WHERE type = 'laminator';

-- ── 8. Redes de seguridad ───────────────────────────────────────────────────
-- Que la incoherencia no pueda volver a entrar en silencio.

DO $$
DECLARE fuera integer; sin_geom integer;
BEGIN
  SELECT count(*) INTO fuera
    FROM public.inventory_items
   WHERE category = 'product_input' AND unit = 'kg' AND estimated_unit_cost < 100;
  IF fuera > 0 THEN
    RAISE EXCEPTION 'Quedan % insumos de producto por kilo bajo $100. Se aborta.', fuera;
  END IF;

  SELECT count(*) INTO sin_geom
    FROM public.inventory_items
   WHERE unit = 'resma' AND (sheet_width_cm IS NULL OR grammage_gsm IS NULL);
  IF sin_geom > 0 THEN
    RAISE EXCEPTION 'Hay % materiales por resma sin geometría de pliego: no se podrían convertir.', sin_geom;
  END IF;
END $$;

-- Un sustrato por kilo nunca cuesta centavos. Es la misma banda que aplica
-- `material-price-sanity.ts` en el cliente; aquí impide que entre a la base.
ALTER TABLE public.inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_precio_con_escala;
ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_precio_con_escala
  CHECK (estimated_unit_cost IS NULL OR unit <> 'kg' OR estimated_unit_cost >= 100);

COMMIT;
