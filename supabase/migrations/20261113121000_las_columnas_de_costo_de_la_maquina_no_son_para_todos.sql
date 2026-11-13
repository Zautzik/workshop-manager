-- Las columnas de costo de la máquina no son para todos
--
-- `machines` tiene `SELECT TO authenticated USING (true)`, y tiene que tenerlo:
-- el piso entero necesita la lista de máquinas. Pero la misma fila lleva
--
--   energy_cost_per_hr, maintenance_cost_monthly, depreciation_monthly
--
-- que son exactamente los insumos de /api/machines/economics — una ruta que
-- exige admin, manager o supervisor. Un técnico o un vendedor los lee igual,
-- directo por PostgREST con su JWT, y con `cost_catalog` reconstruye el
-- reporte completo. También lleva `qr_token`, el secreto de la etiqueta.
--
-- RLS filtra filas, no columnas. Para columnas el mecanismo es el privilegio:
-- se quita el SELECT de tabla y se entrega columna por columna, salvo esas
-- cuatro. El servidor lee por service-role y no cambia.
--
-- Consecuencias, a propósito:
--   · `select=*` sobre `machines` con un JWT de usuario pasa a contestar 42501.
--     Hoy ningún código del navegador lee `machines` directo.
--   · Una columna NUEVA en `machines` nace invisible para `authenticated`
--     hasta que alguien la otorgue. Negar por defecto es lo correcto aquí.
--
-- La lista se arma desde el catálogo, no a mano. Idempotente.

BEGIN;

DO $$
DECLARE
  ocultas CONSTANT text[] := ARRAY[
    'energy_cost_per_hr',
    'maintenance_cost_monthly',
    'depreciation_monthly',
    'qr_token'
  ];
  visibles text;
BEGIN
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
    INTO visibles
  FROM pg_attribute a
  WHERE a.attrelid = 'public.machines'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND NOT (a.attname = ANY (ocultas));

  REVOKE SELECT ON public.machines FROM PUBLIC, anon, authenticated;
  -- Un grant por columna anterior sobreviviría al REVOKE de tabla en una
  -- segunda corrida; se limpia explícitamente.
  EXECUTE format(
    'REVOKE SELECT (%s) ON public.machines FROM anon, authenticated',
    (SELECT string_agg(quote_ident(x), ', ') FROM unnest(ocultas) AS x)
  );
  EXECUTE format('GRANT SELECT (%s) ON public.machines TO authenticated', visibles);

  RAISE NOTICE 'machines: authenticated lee % columnas; ocultas: %.',
    array_length(string_to_array(visibles, ', '), 1), array_to_string(ocultas, ', ');
END $$;

COMMIT;
