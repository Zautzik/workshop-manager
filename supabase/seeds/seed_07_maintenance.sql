-- ============================================================
-- SEED 07 — Maintenance (schema-correct rewrite)
-- 12 months of preventive + corrective maintenance
-- 2 corrective events (Ryobi #2 Aug 2025 + Ryobi #1 Mar 2026)
-- 2 unresolved alerts (active at seed time)
--
-- Run order: 07 of 07
-- Depends on: 01 (machines)
-- Safe to re-run: YES (clears target machine data before insert)
-- ============================================================

DO $$
DECLARE
  m_r1 UUID; m_r2 UUID; m_dc UUID; m_g1 UUID; m_g2 UUID; m_g3 UUID;
  sched_r1_weekly  UUID;
  sched_r1_monthly UUID;
  sched_r1_qtly    UUID;
  sched_r2_weekly  UUID;
  sched_r2_monthly UUID;
  sched_r2_qtly    UUID;
  sched_dc_monthly UUID;
  sched_g1_qtly    UUID;
BEGIN
  SELECT id INTO m_r1 FROM public.machines WHERE name = 'Ryobi Offset 524GS #1' LIMIT 1;
  SELECT id INTO m_r2 FROM public.machines WHERE name = 'Ryobi Offset 524GS #2' LIMIT 1;
  SELECT id INTO m_dc FROM public.machines WHERE name = 'Troqueladora'           LIMIT 1;
  SELECT id INTO m_g1 FROM public.machines WHERE name = 'Guillotine #1'          LIMIT 1;
  SELECT id INTO m_g2 FROM public.machines WHERE name = 'Guillotine #2'          LIMIT 1;
  SELECT id INTO m_g3 FROM public.machines WHERE name = 'Guillotine #3'          LIMIT 1;

  IF m_r1 IS NULL OR m_r2 IS NULL THEN
    RAISE NOTICE 'seed_07: Ryobi machines not found — skipping.';
    RETURN;
  END IF;

  -- Clean prior runs (FK order: alerts/downtime/logs before schedules)
  DELETE FROM public.maintenance_alerts      WHERE machine_id IN (m_r1, m_r2, m_dc, m_g1, m_g2, m_g3);
  DELETE FROM public.machine_downtime_logs   WHERE machine_id IN (m_r1, m_r2, m_dc, m_g1);
  DELETE FROM public.maintenance_logs        WHERE machine_id IN (m_r1, m_r2, m_dc, m_g1);
  DELETE FROM public.maintenance_schedules   WHERE machine_id IN (m_r1, m_r2, m_dc, m_g1, m_g2, m_g3);

  -- ══════════════════════════════════════════════════════════
  -- MAINTENANCE SCHEDULES
  -- ══════════════════════════════════════════════════════════
  INSERT INTO public.maintenance_schedules
    (machine_id, maintenance_type, frequency_days,
     last_maintenance_date, next_maintenance_date,
     description, estimated_duration_hours, status)
  VALUES
    (m_r1, 'preventive',  7, '2026-03-02'::timestamptz, '2026-06-09'::timestamptz,
     'PM Semanal: limpieza tinteros, revisión mantillas, ajuste registro, lubricación.', 1.5, 'scheduled'),
    (m_r1, 'preventive', 30, '2026-02-02'::timestamptz, '2026-06-02'::timestamptz,
     'PM Mensual: revisión rodillos, tensión mantilla, ajuste pH, limpieza tablero, calibración.', 4.0, 'scheduled'),
    (m_r1, 'preventive', 90, '2026-01-26'::timestamptz, '2026-04-27'::timestamptz,
     'PM Trimestral: revisión cojinetes, ajuste correas, limpieza profunda, calibración. Técnico externo Impresiones S.A.', 8.0, 'overdue'),
    (m_r2, 'preventive',  7, '2026-02-02'::timestamptz, '2026-06-02'::timestamptz,
     'PM Semanal Ryobi #2: limpieza tinteros, revisión mantillas, lubricación.', 1.5, 'scheduled'),
    (m_r2, 'preventive', 30, '2026-02-02'::timestamptz, '2026-06-02'::timestamptz,
     'PM Mensual Ryobi #2: revisión rodillos, tensión mantilla, ajuste pH.', 4.0, 'scheduled'),
    (m_r2, 'preventive', 90, '2026-01-26'::timestamptz, '2026-04-27'::timestamptz,
     'PM Trimestral Ryobi #2: revisión cojinetes, ajuste correas, limpieza profunda.', 8.0, 'overdue'),
    (m_dc, 'preventive', 30, '2026-01-05'::timestamptz, '2026-06-02'::timestamptz,
     'PM Mensual Troqueladora: revisión cuchillas, ajuste presión, limpieza sistema alimentación.', 3.0, 'overdue'),
    (m_g1, 'preventive', 90, '2026-02-02'::timestamptz, '2026-05-04'::timestamptz,
     'PM Trimestral Guillotina #1: afilado cuchilla, revisión guarda seguridad, lubricación.', 2.5, 'overdue'),
    (m_g2, 'inspection', 90, '2025-11-03'::timestamptz, '2026-02-02'::timestamptz,
     'Inspección trimestral Guillotina #2.', 1.5, 'overdue'),
    (m_g3, 'inspection', 90, '2025-11-03'::timestamptz, '2026-02-02'::timestamptz,
     'Inspección trimestral Guillotina #3.', 1.5, 'overdue');

  -- Capture schedule IDs for log references
  SELECT id INTO sched_r1_weekly  FROM public.maintenance_schedules WHERE machine_id = m_r1 AND frequency_days = 7  LIMIT 1;
  SELECT id INTO sched_r1_monthly FROM public.maintenance_schedules WHERE machine_id = m_r1 AND frequency_days = 30 LIMIT 1;
  SELECT id INTO sched_r1_qtly    FROM public.maintenance_schedules WHERE machine_id = m_r1 AND frequency_days = 90 LIMIT 1;
  SELECT id INTO sched_r2_weekly  FROM public.maintenance_schedules WHERE machine_id = m_r2 AND frequency_days = 7  LIMIT 1;
  SELECT id INTO sched_r2_monthly FROM public.maintenance_schedules WHERE machine_id = m_r2 AND frequency_days = 30 LIMIT 1;
  SELECT id INTO sched_r2_qtly    FROM public.maintenance_schedules WHERE machine_id = m_r2 AND frequency_days = 90 LIMIT 1;
  SELECT id INTO sched_dc_monthly FROM public.maintenance_schedules WHERE machine_id = m_dc AND frequency_days = 30 LIMIT 1;
  SELECT id INTO sched_g1_qtly    FROM public.maintenance_schedules WHERE machine_id = m_g1 AND frequency_days = 90 LIMIT 1;

  -- ══════════════════════════════════════════════════════════
  -- MAINTENANCE LOGS — PREVENTIVE (Ryobi #1, 12 months)
  -- ══════════════════════════════════════════════════════════
  INSERT INTO public.maintenance_logs
    (machine_id, schedule_id, maintenance_type, technician_name,
     start_date, end_date, actual_duration_hours, status,
     description, issues_found, parts_replaced, cost, notes)
  VALUES
    -- May 2025
    (m_r1, sched_r1_weekly,  'preventive', 'Carlos Muñoz',
     '2025-05-05 07:00'::timestamptz, '2025-05-05 08:30'::timestamptz, 1.5, 'completed',
     'PM Semanal Ryobi #1 — May sem 1',
     'Todo en orden. Tinteros limpios. Registro ±0.1mm.', NULL, 0,
     'Limpieza completa. Lubricación puntos clave.'),
    (m_r1, sched_r1_monthly, 'preventive', 'Carlos Muñoz',
     '2025-05-05 08:30'::timestamptz, '2025-05-05 12:30'::timestamptz, 4.0, 'completed',
     'PM Mensual Ryobi #1 — Mayo 2025',
     'Rodillos OK. Mantilla tensión 85%. pH fuente 4.8.', NULL, 0,
     'Ajuste pH a 5.0. Limpieza tablero. Calibración densitómetro.'),
    -- June 2025
    (m_r1, sched_r1_weekly,  'preventive', 'Carlos Muñoz',
     '2025-06-02 07:00'::timestamptz, '2025-06-02 08:30'::timestamptz, 1.5, 'completed',
     'PM Semanal Ryobi #1 — Jun sem 1', NULL, NULL, 0, 'Limpieza rutinaria.'),
    (m_r1, sched_r1_monthly, 'preventive', 'Carlos Muñoz',
     '2025-06-02 08:30'::timestamptz, '2025-06-02 12:30'::timestamptz, 4.0, 'completed',
     'PM Mensual Ryobi #1 — Junio 2025',
     'Rodillos desgaste normal. Mantilla nueva colocada.',
     'Mantilla offset x1 ($95)', 95.00, 'Cambio mantilla preventivo. Calibración OK.'),
    -- July 2025
    (m_r1, sched_r1_weekly,  'preventive', 'Carlos Muñoz',
     '2025-07-07 07:00'::timestamptz, '2025-07-07 08:30'::timestamptz, 1.5, 'completed',
     'PM Semanal Ryobi #1 — Jul sem 1', NULL, NULL, 0, 'Limpieza rutinaria.'),
    (m_r1, sched_r1_monthly, 'preventive', 'Carlos Muñoz',
     '2025-07-07 08:30'::timestamptz, '2025-07-07 13:00'::timestamptz, 4.5, 'completed',
     'PM Mensual + Pre-Crunch Ryobi #1 — Julio 2025',
     'Cojinetes OK (desgaste normal). Correas correctas. pH fuente 5.0.', NULL, 0,
     'Lubricación extra cojinetes. Ajuste guías. Limpieza profunda tinteros.'),
    (m_r1, sched_r1_qtly,    'preventive', 'Carlos Muñoz',
     '2025-07-28 07:00'::timestamptz, '2025-07-28 15:00'::timestamptz, 8.0, 'completed',
     'PM Trimestral Ryobi #1 — Q2 2025 (Jul)',
     'Técnico externo Impresiones S.A. Cojinetes desgaste normal. Correas OK.',
     NULL, 350.00, 'Limpieza profunda. Calibración completa.'),
    -- Aug 2025
    (m_r1, sched_r1_weekly,  'preventive', 'Carlos Muñoz',
     '2025-08-04 06:30'::timestamptz, '2025-08-04 07:30'::timestamptz, 1.0, 'completed',
     'PM Semanal Ryobi #1 — Ago sem 1 (pre-crunch)',
     'Revisión rápida. OK para crunch.', NULL, 0, 'Limpieza tinteros. Lubricación rápida.'),
    -- Sep 2025
    (m_r1, sched_r1_weekly,  'preventive', 'Carlos Muñoz',
     '2025-09-01 07:00'::timestamptz, '2025-09-01 08:30'::timestamptz, 1.5, 'completed',
     'PM Semanal Ryobi #1 — Sep sem 1 (post-crunch)',
     'Post-crunch: desgaste acelerado en rodillo entintador #2.', NULL, 0,
     'Monitoreo. Programar revisión técnico en Oct.'),
    (m_r1, sched_r1_monthly, 'preventive', 'Carlos Muñoz',
     '2025-09-01 08:30'::timestamptz, '2025-09-01 12:30'::timestamptz, 4.0, 'completed',
     'PM Mensual Ryobi #1 — Septiembre 2025',
     'Rodillo entintador #2 con rayaduras leves (post-crunch 280h). pH fuente 4.9.', NULL, 0,
     'Ajuste pH. Nota en bitácora para reemplazo en próximo trimestral.'),
    -- Oct 2025
    (m_r1, sched_r1_weekly,  'preventive', 'Carlos Muñoz',
     '2025-10-06 07:00'::timestamptz, '2025-10-06 08:30'::timestamptz, 1.5, 'completed',
     'PM Semanal Ryobi #1 — Oct sem 1', NULL, NULL, 0, 'Rutina.'),
    (m_r1, sched_r1_qtly,    'preventive', 'Carlos Muñoz',
     '2025-10-27 08:00'::timestamptz, '2025-10-27 16:30'::timestamptz, 8.5, 'completed',
     'PM Trimestral Ryobi #1 — Q3 2025 (Oct)',
     'Cojinetes desgaste por encima del promedio post-crunch. Rodillo entintador #2 reemplazado.',
     'Rodillo entintador x1 ($480)', 830.00,
     'Reemplazo rodillo entintador #2. Lubricación extra. Calibración completa.'),
    -- Nov 2025
    (m_r1, sched_r1_weekly,  'preventive', 'Jorge Herrera',
     '2025-11-03 07:00'::timestamptz, '2025-11-03 08:30'::timestamptz, 1.5, 'completed',
     'PM Semanal Ryobi #1 — Nov sem 1 (Jorge cubre licencia Carlos)',
     NULL, NULL, 0, 'Limpieza. Lubricación.'),
    -- Dec 2025
    (m_r1, sched_r1_monthly, 'preventive', 'Carlos Muñoz',
     '2025-12-01 07:00'::timestamptz, '2025-12-01 11:00'::timestamptz, 4.0, 'completed',
     'PM Mensual Ryobi #1 — Diciembre 2025',
     'Dic lento. Todo OK. Cojinetes normales.', NULL, 0,
     'Limpieza profunda aprovechando baja carga.'),
    -- Jan 2026
    (m_r1, sched_r1_weekly,  'preventive', 'Carlos Muñoz',
     '2026-01-05 07:00'::timestamptz, '2026-01-05 08:30'::timestamptz, 1.5, 'completed',
     'PM Semanal Ryobi #1 — Ene sem 1 2026', NULL, NULL, 0, 'Rutina.'),
    (m_r1, sched_r1_qtly,    'preventive', 'Carlos Muñoz',
     '2026-01-26 08:00'::timestamptz, '2026-01-26 16:30'::timestamptz, 8.5, 'completed',
     'PM Trimestral Ryobi #1 — Q4 2025 (Ene 2026)',
     'Cojinetes: desgaste ALTO en cojinete principal derecho. Reemplazo recomendado en 60 días.',
     NULL, 420.00, 'Lubricación especial cojinete principal. Ajuste correas. Calibración.'),
    -- Feb 2026
    (m_r1, sched_r1_monthly, 'preventive', 'Carlos Muñoz',
     '2026-02-02 07:00'::timestamptz, '2026-02-02 11:00'::timestamptz, 4.0, 'completed',
     'PM Mensual Ryobi #1 — Febrero 2026',
     'Cojinete principal monitorizado. Desgaste avanzando. No crítico aún.', NULL, 0,
     'Lubricación extra. Nota en bitácora.'),
    -- Mar 2026 (pre-breakdown)
    (m_r1, sched_r1_weekly,  'preventive', 'Carlos Muñoz',
     '2026-03-02 07:00'::timestamptz, '2026-03-02 08:30'::timestamptz, 1.5, 'completed',
     'PM Semanal Ryobi #1 — Mar sem 1 (pre-crunch Q3)',
     'Ruido leve en cojinete principal. Carlos comunica a supervisor.', NULL, 0,
     'Lubricación extra. Monitoreo estrecho.');

  -- ══════════════════════════════════════════════════════════
  -- MAINTENANCE LOGS — PREVENTIVE (Ryobi #2, Die Cutter, Guillotina)
  -- ══════════════════════════════════════════════════════════
  INSERT INTO public.maintenance_logs
    (machine_id, schedule_id, maintenance_type, technician_name,
     start_date, end_date, actual_duration_hours, status,
     description, issues_found, parts_replaced, cost, notes)
  VALUES
    (m_r2, sched_r2_weekly,  'preventive', 'Jorge Herrera',
     '2025-05-05 07:00'::timestamptz, '2025-05-05 08:30'::timestamptz, 1.5, 'completed',
     'PM Semanal Ryobi #2 — May', NULL, NULL, 0, 'Rutina.'),
    (m_r2, sched_r2_monthly, 'preventive', 'Jorge Herrera',
     '2025-05-05 09:30'::timestamptz, '2025-05-05 13:30'::timestamptz, 4.0, 'completed',
     'PM Mensual Ryobi #2 — Mayo 2025',
     'Rodillos OK. Mantilla tensión 88%. pH fuente 5.0.', NULL, 0, 'Ajuste menor. Limpieza.'),
    (m_r2, sched_r2_qtly,    'preventive', 'Jorge Herrera',
     '2025-07-28 12:00'::timestamptz, '2025-07-28 20:00'::timestamptz, 8.0, 'completed',
     'PM Trimestral Ryobi #2 — Q2 2025',
     'Todo en excelente estado. Ryobi #2 tiene 30% menos horas que #1.',
     NULL, 320.00, 'Limpieza profunda. Calibración.'),
    (m_r2, sched_r2_qtly,    'preventive', 'Jorge Herrera',
     '2025-10-27 12:00'::timestamptz, '2025-10-27 20:00'::timestamptz, 8.0, 'completed',
     'PM Trimestral Ryobi #2 — Q3 2025', 'Todo OK. Sin desgaste anormal.',
     NULL, 320.00, 'Calibración. Limpieza profunda.'),
    (m_r2, sched_r2_qtly,    'preventive', 'Jorge Herrera',
     '2026-01-26 12:00'::timestamptz, '2026-01-26 20:00'::timestamptz, 8.0, 'completed',
     'PM Trimestral Ryobi #2 — Q4 2025', 'Cojinetes OK. Todo normal.',
     NULL, 320.00, 'Calibración. Limpieza.'),
    (m_r2, sched_r2_monthly, 'preventive', 'Jorge Herrera',
     '2026-02-02 09:30'::timestamptz, '2026-02-02 13:30'::timestamptz, 4.0, 'completed',
     'PM Mensual Ryobi #2 — Feb 2026',
     'Rodillo entintador #3 con rayaduras superficiales. No afecta calidad.', NULL, 0,
     'Monitoreo. Reemplazar en PM trimestral abril.'),
    -- Die Cutter
    (m_dc, sched_dc_monthly, 'preventive', 'Miguel Fernández',
     '2025-06-02 09:00'::timestamptz, '2025-06-02 12:00'::timestamptz, 3.0, 'completed',
     'PM Mensual Troqueladora — Jun 2025',
     'Cuchillas OK. Presión 85 kN/m. Alimentación OK.', NULL, 0, 'Limpieza. Ajuste presión.'),
    (m_dc, sched_dc_monthly, 'preventive', 'Miguel Fernández',
     '2025-09-01 09:00'::timestamptz, '2025-09-01 12:00'::timestamptz, 3.0, 'completed',
     'PM Mensual Troqueladora — Sep 2025',
     'Cuchilla inferior con desgaste en zona inferior.',
     'Cuchilla inferior x1 ($210)', 210.00, 'Reemplazo cuchilla inferior. OK.'),
    (m_dc, sched_dc_monthly, 'preventive', 'Miguel Fernández',
     '2026-01-05 09:00'::timestamptz, '2026-01-05 12:00'::timestamptz, 3.0, 'completed',
     'PM Mensual Troqueladora — Ene 2026', NULL, NULL, 0, 'Rutina.'),
    -- Guillotina #1
    (m_g1, sched_g1_qtly,    'preventive', 'Ana Martínez',
     '2025-08-04 11:00'::timestamptz, '2025-08-04 13:30'::timestamptz, 2.5, 'completed',
     'PM Trimestral Guillotina #1 — Q2 2025',
     'Cuchilla afilada. Guarda seguridad OK. Lubricación correcta.',
     NULL, 45.00, 'Afilado cuchilla. Lubricación completa.'),
    (m_g1, sched_g1_qtly,    'preventive', 'Ana Martínez',
     '2025-11-03 11:00'::timestamptz, '2025-11-03 13:30'::timestamptz, 2.5, 'completed',
     'PM Trimestral Guillotina #1 — Q3 2025', NULL, NULL, 45.00, 'Afilado. Lubricación.'),
    (m_g1, sched_g1_qtly,    'preventive', 'Ana Martínez',
     '2026-02-02 11:00'::timestamptz, '2026-02-02 13:30'::timestamptz, 2.5, 'completed',
     'PM Trimestral Guillotina #1 — Q4 2025', NULL, NULL, 45.00, 'Afilado. Lubricación.');

  -- ══════════════════════════════════════════════════════════
  -- MAINTENANCE LOGS — CORRECTIVE
  -- ══════════════════════════════════════════════════════════
  INSERT INTO public.maintenance_logs
    (machine_id, maintenance_type, technician_name,
     start_date, end_date, actual_duration_hours, status,
     description, issues_found, parts_replaced, cost, notes)
  VALUES
    -- Aug 2025: tintero contamination stop (Ryobi #2)
    (m_r2, 'corrective', 'Jorge Herrera',
     '2025-08-18 19:30'::timestamptz, '2025-08-18 20:10'::timestamptz, 0.67, 'completed',
     'CORRECTIVO: Contaminación tintero negro Ryobi #2 — turno noche OT-2025-021',
     'Contaminación en tintero negro. 1.500 etiquetas rayadas descartadas.',
     NULL, 0,
     'Parada 40 min. Limpieza completa tintero negro. Prueba muestra supervisada. Reanudación 20:10.'),
    -- Mar 2026: CRITICAL bearing failure (Ryobi #1)
    (m_r1, 'corrective', 'Carlos Muñoz',
     '2026-03-11 09:30'::timestamptz, '2026-03-13 14:00'::timestamptz, 52.5, 'completed',
     'CORRECTIVO CRÍTICO: Falla cojinete principal Ryobi #1 — Crunch Q3',
     'Falla súbita 09:30h del 11/03/2026 durante OT-2026-011 (LabelCorp NeuroCalm Q3). '
     'Desgaste cojinete principal derecho documentado en PM ene 2026. '
     'Máquina fuera de servicio 52.5h. OT-011 retrasada, OT-013 subcontratada parcial.',
     'Cojinete principal x1 ($580) + cojinete secundario x1 ($320) + mantilla x1 ($97)',
     2497.00,
     'Técnico externo Impresiones S.A. de urgencia. Reemplazo cojinete principal + secundario. '
     'Calibración completa. Operativa 13/03 14:00h.');

  -- ══════════════════════════════════════════════════════════
  -- MACHINE DOWNTIME LOGS
  -- ══════════════════════════════════════════════════════════
  INSERT INTO public.machine_downtime_logs
    (machine_id, reason, start_time, end_time, duration_hours, impact_description, notes)
  VALUES
    (m_r2,
     'Contaminación tintero negro. Parada calidad OT-021.',
     '2025-08-18 19:30'::timestamptz, '2025-08-18 20:10'::timestamptz, 0.67,
     'Producción pausada 40 min. 1.500 etiquetas descartadas.',
     'Resuelto en turno por Jorge Herrera.'),
    (m_r1,
     'Falla cojinete principal derecho. Parada de emergencia.',
     '2026-03-11 09:30'::timestamptz, '2026-03-13 14:00'::timestamptz, 52.5,
     'Carga redirigida a Ryobi #2 y subcontrato. 3 OTs afectadas: '
     'OT-011 retrasada, OT-013 subcontratada parcial, OT-014 a turnos noche.',
     'Técnico externo Impresiones S.A. Ver correctivo MAINT-CORR-2026-R1-001.');

  -- ══════════════════════════════════════════════════════════
  -- MAINTENANCE ALERTS
  -- ══════════════════════════════════════════════════════════
  INSERT INTO public.maintenance_alerts
    (machine_id, alert_type, severity, title, description,
     is_resolved, resolved_at, created_at)
  VALUES
    -- RESOLVED: Jan 2026 bearing warning (led to Mar 2026 breakdown)
    (m_r1, 'desgaste', 'high',
     'Desgaste alto en cojinete principal Ryobi #1',
     'PM Trimestral Q4 2025 (26-ene-2026): técnico Impresiones S.A. detectó desgaste alto '
     'en cojinete principal derecho. Reemplazo recomendado en 60 días. '
     'Riesgo de falla en producción si no se actúa.',
     true, '2026-03-13 15:00'::timestamptz, '2026-01-26 17:00'::timestamptz),
    -- ACTIVE: Ryobi #2 rodillo entintador #3 wear
    (m_r2, 'desgaste', 'medium',
     'Rodillo entintador #3 Ryobi #2 — desgaste moderado',
     'Detectado en PM mensual febrero 2026: rodillo entintador #3 presenta rayaduras '
     'superficiales. No afecta calidad actual. Reemplazar en PM trimestral abril 2026.',
     false, NULL, '2026-02-02 14:00'::timestamptz),
    -- ACTIVE: Quarterly PM overdue reminder
    (m_r1, 'preventivo', 'low',
     'PM Trimestral Ryobi #1 — programar para Abr 2026',
     'PM trimestral vence 27-abr-2026. Coordinar con técnico externo. '
     'Crunch mayo-junio 2026 proyectado.',
     false, NULL, '2026-04-01 08:00'::timestamptz);

END $$;
