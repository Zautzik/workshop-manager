-- Las tablas financieras no aguantan la plata de este taller, y una suma miente.
--
-- Dos problemas distintos que se descubrieron al sembrar cuatro meses de
-- operación real ($1.350 millones de venta al mes).
--
-- ── 1. El techo de DECIMAL(10,2) ────────────────────────────────────────────
--
-- DECIMAL(10,2) tope en $99.999.999,99. Suena a mucho hasta que se escribe la
-- venta mensual de una máquina: $450 millones. Postgres no redondea ni avisa,
-- rechaza la fila entera con «numeric field overflow», y la siembra se detiene.
--
-- No es un caso extremo inventado: es el taller que la demo describe, y sería
-- el primer mes de uso real de cualquier imprenta mediana chilena. En pesos
-- chilenos, ocho dígitos son cien millones — un solo trabajo grande.
--
-- ── 2. `ot_financials.total_cost` no suma el tercerizado ────────────────────
--
-- La columna se definió así:
--
--     total_cost GENERATED ALWAYS AS
--       (material_cost + labor_cost + machine_cost + overhead_cost) STORED
--
-- Una migración posterior agregó `outsourcing_cost` a la tabla y NO actualizó
-- la suma. Desde entonces todo trabajo enviado a un tercero tiene un costo
-- total que omite justamente la partida que lo encareció — y el `profit`, que
-- se calcula con la misma fórmula, sale de más.
--
-- Es exactamente el error que más caro sale: no rompe nada, no da error, y
-- reporta el número equivocado hacia el lado agradable. Con el taller mandando
-- 144 de 245 trabajos afuera por falta de capacidad de terminaciones, la
-- omisión no es marginal.
--
-- La vista `ot_cost_summary` no tiene el problema: suma `ot_cost_lines`, que sí
-- lleva la categoría `outsourced`. Ésta es la tabla vieja, la que el propio
-- ledger describe como «drift-prone». Se corrige igual: mientras exista y algo
-- la lea, tiene que decir la verdad.

BEGIN;

-- ── ot_financials ───────────────────────────────────────────────────────────
-- Las columnas generadas se recrean; las de base sólo se ensanchan.

ALTER TABLE public.ot_financials DROP COLUMN IF EXISTS total_cost;
ALTER TABLE public.ot_financials DROP COLUMN IF EXISTS profit;

ALTER TABLE public.ot_financials
  ALTER COLUMN material_cost    TYPE NUMERIC(16,2),
  ALTER COLUMN labor_cost       TYPE NUMERIC(16,2),
  ALTER COLUMN machine_cost     TYPE NUMERIC(16,2),
  ALTER COLUMN overhead_cost    TYPE NUMERIC(16,2),
  ALTER COLUMN revenue          TYPE NUMERIC(16,2);

-- `outsourcing_cost` y `energy_cost` los agregó una migración posterior, así
-- que puede que no existan en bases muy viejas.
ALTER TABLE public.ot_financials
  ADD COLUMN IF NOT EXISTS outsourcing_cost NUMERIC(16,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS energy_cost      NUMERIC(16,2) DEFAULT 0;

ALTER TABLE public.ot_financials
  ALTER COLUMN outsourcing_cost TYPE NUMERIC(16,2),
  ALTER COLUMN energy_cost      TYPE NUMERIC(16,2);

-- Ahora sí, con TODAS las partidas.
ALTER TABLE public.ot_financials
  ADD COLUMN total_cost NUMERIC(16,2) GENERATED ALWAYS AS (
    COALESCE(material_cost, 0)
    + COALESCE(labor_cost, 0)
    + COALESCE(machine_cost, 0)
    + COALESCE(overhead_cost, 0)
    + COALESCE(outsourcing_cost, 0)
    + COALESCE(energy_cost, 0)
  ) STORED;

ALTER TABLE public.ot_financials
  ADD COLUMN profit NUMERIC(16,2) GENERATED ALWAYS AS (
    COALESCE(revenue, 0) - (
      COALESCE(material_cost, 0)
      + COALESCE(labor_cost, 0)
      + COALESCE(machine_cost, 0)
      + COALESCE(overhead_cost, 0)
      + COALESCE(outsourcing_cost, 0)
      + COALESCE(energy_cost, 0)
    )
  ) STORED;

COMMENT ON COLUMN public.ot_financials.total_cost IS
  'Suma de TODAS las partidas, tercerizado incluido. Antes lo omitía: un trabajo hecho afuera reportaba un costo que dejaba fuera justamente lo que lo encareció.';

-- ── machine_costs ───────────────────────────────────────────────────────────

ALTER TABLE public.machine_costs DROP COLUMN IF EXISTS total_operating_cost;

ALTER TABLE public.machine_costs
  ALTER COLUMN energy_cost       TYPE NUMERIC(16,2),
  ALTER COLUMN labor_cost        TYPE NUMERIC(16,2),
  ALTER COLUMN maintenance_cost  TYPE NUMERIC(16,2),
  ALTER COLUMN spare_parts_cost  TYPE NUMERIC(16,2),
  ALTER COLUMN outsourcing_cost  TYPE NUMERIC(16,2),
  ALTER COLUMN revenue_generated TYPE NUMERIC(16,2);

ALTER TABLE public.machine_costs
  ADD COLUMN total_operating_cost NUMERIC(16,2) GENERATED ALWAYS AS (
    COALESCE(energy_cost, 0)
    + COALESCE(labor_cost, 0)
    + COALESCE(maintenance_cost, 0)
    + COALESCE(spare_parts_cost, 0)
    + COALESCE(outsourcing_cost, 0)
  ) STORED;

-- `equipment_investments` tiene el mismo techo —una Ryobi vale más de cien
-- millones de pesos— y NO se toca acá: su `payback_period_months` es una
-- columna generada que depende de `purchase_cost`, y Postgres no deja alterar
-- el tipo de una columna de la que otra depende. Ensancharla pide recrear la
-- generada, que es una migración aparte con su propia comprobación. Se anota
-- para no perderlo: hoy ninguna pantalla escribe ahí.

-- ── Red de seguridad ────────────────────────────────────────────────────────
-- Que la suma incluya el tercerizado, comprobado contra la base y no de memoria.

DO $$
DECLARE mal integer;
BEGIN
  SELECT count(*) INTO mal
    FROM public.ot_financials
   WHERE COALESCE(outsourcing_cost, 0) > 0
     AND total_cost < COALESCE(material_cost,0) + COALESCE(outsourcing_cost,0);
  IF mal > 0 THEN
    RAISE EXCEPTION 'Quedaron % filas cuyo total no incluye el tercerizado. Se aborta.', mal;
  END IF;
END $$;

COMMIT;
