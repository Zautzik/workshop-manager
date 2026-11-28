-- El costo de la máquina no necesita una tercera tabla
--
-- Lo que cuesta una máquina se guardaba en tres lugares del lado de la máquina,
-- además de la tarifa del catálogo:
--
--   machines.energy_cost_per_hr / maintenance_cost_monthly / depreciation_monthly
--       el perfil. Lo lee Equipos → Economía («Tarifa vs. Catálogo»).
--   machine_costs
--       el costo operativo por mes. Lo lee Equipos → Economía («Costo Operativo»)
--       y Analítica → Máquinas. 48 filas.
--   machine_cost_entries
--       OTRO costo por mes (energía, mantención, insumos, otros), con su propio
--       formulario en la ficha de la máquina. CERO filas, en la nube y en local.
--
-- La tercera repite a la segunda con otras columnas y nadie la llenó nunca.
-- Dos formularios para el mismo dato garantizan que el día que alguien cargue
-- uno, la pantalla que lee el otro siga vacía. Se retira la que no tiene datos
-- ni lectores fuera de su propia pestaña; el costo mensual se registra en
-- `machine_costs`.
--
-- Nada en la base depende de ella (verificado: sin FKs entrantes, sin vistas,
-- sin funciones que la nombren). Si alguna vez tuvo filas, esto se detiene en
-- vez de borrarlas.

BEGIN;

DO $$
DECLARE
  n bigint;
BEGIN
  IF to_regclass('public.machine_cost_entries') IS NULL THEN
    RAISE NOTICE 'machine_cost_entries ya no existe; nada que hacer.';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM public.machine_cost_entries' INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION
      'machine_cost_entries tiene % fila(s). Se esperaba vacía: migrar esos costos a machine_costs antes de retirarla.', n;
  END IF;

  DROP TABLE public.machine_cost_entries;
  RAISE NOTICE 'machine_cost_entries retirada (estaba vacía).';
END $$;

COMMIT;
