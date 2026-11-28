-- Las horas reales viven en las pasadas
--
-- Una hora trabajada se guardaba en dos lugares:
--
--   ot_stage_reports.hours             lo que declara quien cierra la etapa.
--                                      De acá sale el costo (stage-valuation.ts).
--   ot_machine_schedule.actual_hours   una columna que ninguna pantalla escribe;
--                                      sólo la llenó el seed.
--
-- Y no decían lo mismo: 2.345 h contra 2.297 h, con 7 pares OT/máquina
-- distintos (auditoría 2026-11-13). Lo grave no es la diferencia sino quién
-- leía cada una: el costo leía las pasadas y `estimate_ot_hours` —el "Tier 2
-- histórico" que afina las horas del Cronograma— leía la columna muerta. La
-- planificación aprendía de un número que el taller no alimenta, así que en
-- producción ese tier nunca iba a tener una muestra real.
--
-- Una sola fuente: las pasadas.
--
-- ── Qué cambia en estimate_ot_hours ────────────────────────────────────────
--
-- Sólo el Tier 2. El Tier 1 (reglas) y la mezcla por confianza (≥20 muestras
-- 70 % historial, ≥5 40 %) quedan idénticos.
--
-- La muestra ahora es «horas que una OT parecida pasó en la etapa que hace este
-- tipo de máquina», tomada de `workflow_step`, no de `machine_id`: las pasadas
-- viejas guardaban la prensa como máquina para TODAS las etapas
-- (stage-machine.ts), y unir por máquina contaría horas de guillotina como
-- horas de offset.
--
-- Se suman las pasadas de una misma OT y etapa antes de promediar: un avance
-- parcial parte la etapa en varias pasadas, y promediarlas sueltas haría que
-- una OT partida en tres pesara tres veces y pareciera tres trabajos cortos.
--
-- La OT que se estima queda fuera de su propia muestra.
--
-- `CREATE OR REPLACE` conserva los permisos: sigue siendo sólo de service_role.

BEGIN;

CREATE OR REPLACE FUNCTION public.estimate_ot_hours(p_ot_id uuid, p_machine_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ot              RECORD;
  v_machine_type    TEXT;
  v_steps           TEXT[];

  -- Tier-1 constants
  v_base_sph        NUMERIC := 3000;   -- sheets per hour for offset (default)
  v_setup_h         NUMERIC := 0.5;
  v_color_mult      NUMERIC := 1.0;
  v_finish_h        NUMERIC := 0.0;
  v_tier1           NUMERIC;

  -- Tier-2 historical
  v_hist_avg        NUMERIC;
  v_hist_count      INTEGER;
  v_tier2           NUMERIC;
  v_confidence      TEXT;
  v_final           NUMERIC;
BEGIN
  -- Fetch OT spec
  SELECT quantity, color_front, color_back, calc_sheets, calc_print_hours, calc_finish_hours,
         finish_troquelado, finish_plegado, finish_pegado, finish_laminado,
         finish_barniz, finish_relieve, finish_perforado, finish_hot_stamping,
         finish_uv_localizado, finish_numeracion
    INTO v_ot
    FROM public.ots
   WHERE id = p_ot_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'OT not found');
  END IF;

  -- Determine machine type
  v_machine_type := COALESCE(p_machine_type, 'offset_printer');

  -- ── Tier-1: rule-based ───────────────────────────────────
  -- Machine speed constants (sheets/hour)
  v_base_sph := CASE v_machine_type
    WHEN 'offset_printer'  THEN 5000
    WHEN 'digital_printer' THEN 1200
    WHEN 'die_cutter'      THEN 3000
    WHEN 'guillotine'      THEN 4000
    WHEN 'manual_workshop' THEN 500
    ELSE 2000
  END;

  -- Color complexity multiplier
  v_color_mult := CASE
    WHEN v_ot.color_front = 'cmyk_pantone' THEN 1.4
    WHEN v_ot.color_front = 'cmyk'         THEN 1.0
    WHEN v_ot.color_front = '3_color'      THEN 0.85
    WHEN v_ot.color_front = '2_color'      THEN 0.70
    WHEN v_ot.color_front = '1_color'      THEN 0.55
    ELSE 0.4
  END;

  -- Setup time (add extra for pantone inks)
  v_setup_h := 0.5 + CASE WHEN v_ot.color_front = 'cmyk_pantone' THEN 0.25 ELSE 0 END;

  -- Finishing hours
  v_finish_h :=
    CASE WHEN v_ot.finish_troquelado    THEN 0.5 ELSE 0 END +
    CASE WHEN v_ot.finish_plegado       THEN 0.3 ELSE 0 END +
    CASE WHEN v_ot.finish_pegado        THEN 0.4 ELSE 0 END +
    CASE WHEN v_ot.finish_laminado      THEN 0.3 ELSE 0 END +
    CASE WHEN v_ot.finish_barniz        THEN 0.2 ELSE 0 END +
    CASE WHEN v_ot.finish_relieve       THEN 0.4 ELSE 0 END +
    CASE WHEN v_ot.finish_perforado     THEN 0.3 ELSE 0 END +
    CASE WHEN v_ot.finish_hot_stamping  THEN 0.5 ELSE 0 END +
    CASE WHEN v_ot.finish_uv_localizado THEN 0.3 ELSE 0 END +
    CASE WHEN v_ot.finish_numeracion    THEN 0.4 ELSE 0 END;

  -- Use existing calc_print_hours if set, else derive from sheets
  v_tier1 := COALESCE(
    v_ot.calc_print_hours,
    ROUND(
      v_setup_h
      + (COALESCE(v_ot.calc_sheets, CEIL(v_ot.quantity::NUMERIC / 8)) / v_base_sph) * v_color_mult
      + COALESCE(v_ot.calc_finish_hours, v_finish_h),
      2
    )
  );

  -- ── Tier-2: historical calibration ──────────────────────
  -- Las etapas del tablero que hace este tipo de máquina (production-route.ts,
  -- PLAN_STEPS). Un tipo sin etapa propia no tiene historial: queda en Tier 1.
  v_steps := CASE v_machine_type
    WHEN 'offset_printer'  THEN ARRAY['offset_printing']
    WHEN 'digital_printer' THEN ARRAY['digital_printing']
    WHEN 'guillotine'      THEN ARRAY['guillotine_first_cut', 'guillotine_final_cut']
    WHEN 'die_cutter'      THEN ARRAY['die_cutting']
    WHEN 'laminator'       THEN ARRAY['die_cutting']
    WHEN 'manual_workshop' THEN ARRAY['workshop', 'workshop_revision']
    WHEN 'folder'          THEN ARRAY['workshop']
    ELSE ARRAY[]::TEXT[]
  END;

  -- Past jobs with the same stage + color mode + similar quantity, from the
  -- hours the shop actually declared when closing the stage.
  SELECT
    ROUND(AVG(h.hours), 2),
    COUNT(*)
  INTO v_hist_avg, v_hist_count
  FROM (
    SELECT r.ot_id, r.workflow_step, SUM(r.hours) AS hours
    FROM public.ot_stage_reports r
    JOIN public.ots o ON o.id = r.ot_id
    WHERE r.hours > 0
      AND r.workflow_step::TEXT = ANY (v_steps)
      AND r.ot_id <> p_ot_id
      AND o.color_front  = v_ot.color_front
      AND o.quantity BETWEEN v_ot.quantity * 0.7 AND v_ot.quantity * 1.3
    GROUP BY r.ot_id, r.workflow_step
  ) h;

  v_confidence := CASE
    WHEN v_hist_count >= 20 THEN 'high'
    WHEN v_hist_count >=  5 THEN 'medium'
    ELSE 'low'
  END;

  -- Blend Tier-1 + Tier-2 based on confidence
  v_tier2 := v_hist_avg;
  v_final := CASE
    WHEN v_hist_count >= 20 THEN ROUND(v_tier1 * 0.3 + v_hist_avg * 0.7, 2)
    WHEN v_hist_count >=  5 THEN ROUND(v_tier1 * 0.6 + v_hist_avg * 0.4, 2)
    ELSE v_tier1
  END;

  RETURN jsonb_build_object(
    'estimated_hours', v_final,
    'tier1_hours',     v_tier1,
    'tier2_hours',     v_tier2,
    'sample_count',    v_hist_count,
    'confidence',      v_confidence
  );
END;
$function$;

-- La columna duplicada. Nada más la lee (verificado en pg_depend y pg_proc) y
-- ninguna pantalla la escribe; los valores que tiene son del seed.
ALTER TABLE public.ot_machine_schedule DROP COLUMN IF EXISTS actual_hours;

COMMENT ON COLUMN public.ot_stage_reports.hours IS
  'Horas reales de la pasada. ÚNICA fuente de horas trabajadas: de acá sale el costo de máquina y mano de obra (stage-valuation.ts) y el historial de estimate_ot_hours.';

COMMIT;
