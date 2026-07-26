-- Una sola moneda: CLP.
--
-- La base guardaba sueldos en USD (compensation_rates.currency_code = 'USD')
-- mientras el catálogo de costos está en CLP. Son la misma clase de número —
-- el precio de una hora de trabajo — con ~950× de diferencia, y nada en el
-- esquema lo advertía. El costeo real de OT sumaba líneas de mano de obra en
-- USD junto a líneas de catálogo en CLP, subestimando la mano de obra ~950×.
--
-- ⚠ DECISIÓN DE NEGOCIO — REVISAR ANTES DE APLICAR
-- Los sueldos en USD NO derivan del catálogo por ningún tipo de cambio único:
--     Carlos (offset)      USD 16 vs catálogo prensa        8.500 → implícito 531
--     Ana (terminaciones)  USD  9 vs catálogo terminaciones 6.500 → implícito 722
-- Es decir, fueron cargados por separado. Convertirlos exige ELEGIR una tasa, y
-- esa elección cambia el sueldo declarado de cada persona. El valor de abajo es
-- el tipo de cambio de mercado aproximado; ajústalo si el taller usa otro, o
-- reemplaza esta migración por los valores reales de cada contrato.
--
-- Con 950: Ana 9 → 8.550/h · Carlos 16 → 15.200/h · Valentina 22 → 20.900/h
-- (Referencia: sueldo mínimo ≈ 2.900 CLP/h, así que quedan en rango de oficio
--  calificado, que es lo que son.)

DO $$
DECLARE
  -- ── AJUSTA AQUÍ SI CORRESPONDE ──────────────────────────────────────────
  fx_clp_per_usd NUMERIC := 950;
  -- ────────────────────────────────────────────────────────────────────────
  converted INTEGER;
BEGIN
  UPDATE public.compensation_rates
  SET
    hourly_rate   = ROUND(hourly_rate * fx_clp_per_usd),
    currency_code = 'CLP'
  WHERE currency_code IS DISTINCT FROM 'CLP';

  GET DIAGNOSTICS converted = ROW_COUNT;
  RAISE NOTICE 'compensation_rates convertidas a CLP: % (fx=%)', converted, fx_clp_per_usd;
END $$;

-- Nuevas filas nacen en CLP salvo que alguien diga lo contrario explícitamente.
ALTER TABLE public.compensation_rates
  ALTER COLUMN currency_code SET DEFAULT 'CLP';

-- El peso chileno no se usa con decimales en la práctica. Los cálculos
-- intermedios sí conservan precisión (ver `pesos()` en src/lib/format.ts); lo
-- que se guarda y se muestra es el peso entero.
UPDATE public.compensation_rates
SET hourly_rate = ROUND(hourly_rate)
WHERE hourly_rate <> ROUND(hourly_rate);

-- Deja el invariante escrito donde el próximo lector lo encuentre.
COMMENT ON COLUMN public.compensation_rates.currency_code IS
  'Siempre CLP. La app opera en una sola moneda: mezclar unidades aquí desalinea el costeo real de OT contra el catálogo (auditoría 2026-07).';
COMMENT ON COLUMN public.compensation_rates.hourly_rate IS
  'Pesos chilenos por hora, entero. Los decimales se conservan en los cálculos, no en el almacenamiento.';
