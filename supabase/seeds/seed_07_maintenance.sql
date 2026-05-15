-- ============================================================
-- SEED 07 — Maintenance
-- 12 months of preventive + corrective maintenance
-- 2 corrective events (Ryobi #1 Aug crunch + Mar crunch breakdown)
-- 1 unresolved alert (active at seed time)
--
-- Run order: 07 of 07
-- Depends on: 01 (machines), 02 (employees)
-- Safe to re-run: YES (ON CONFLICT DO NOTHING)
--
-- TINKER TIPS:
--   • Resolve the unresolved alert and watch its card disappear
--     from the maintenance alerts widget.
--   • Change the Ryobi #1 Mar 2026 corrective log to status
--     'in_progress' to simulate an ongoing repair on the board.
--   • Set program_task_logs.completed = false for a crunch month
--     row to simulate a missed PM check — the compliance % drops.
-- ============================================================

DO $$
DECLARE
  m_r1 UUID; m_r2 UUID; m_dc UUID; m_g1 UUID; m_g2 UUID;
  m_g3 UUID; m_ws1 UUID;
  e_carlos UUID; e_jorge UUID; e_supervisor UUID;
  -- employee IDs for task completion
  e_miguel UUID; e_ana UUID;
  -- maintenance program IDs (created by migration 20260423100100)
  prog_r1_weekly  UUID;
  prog_r1_monthly UUID;
  prog_r1_qtly    UUID;
  prog_r2_weekly  UUID;
  prog_r2_monthly UUID;
BEGIN
  -- Resolve machines
  SELECT id INTO m_r1  FROM public.machines WHERE lower(name) = 'ryobi offset 524gs #1' LIMIT 1;
  SELECT id INTO m_r2  FROM public.machines WHERE lower(name) = 'ryobi offset 524gs #2' LIMIT 1;
  SELECT id INTO m_dc  FROM public.machines WHERE lower(name) = 'die cutter #1'          LIMIT 1;
  SELECT id INTO m_g1  FROM public.machines WHERE lower(name) = 'guillotine #1'          LIMIT 1;
  SELECT id INTO m_g2  FROM public.machines WHERE lower(name) = 'guillotine #2'          LIMIT 1;

  -- Resolve employees
  SELECT id INTO e_carlos     FROM public.employees WHERE rut = '12.345.678-9' LIMIT 1;
  SELECT id INTO e_jorge      FROM public.employees WHERE rut = '13.456.789-0' LIMIT 1;
  SELECT id INTO e_miguel     FROM public.employees WHERE rut = '14.567.890-1' LIMIT 1;
  SELECT id INTO e_ana        FROM public.employees WHERE rut = '15.678.901-2' LIMIT 1;
  SELECT id INTO e_supervisor FROM public.employees WHERE rut = '11.223.344-5' LIMIT 1;

  -- ══════════════════════════════════════════════════════════
  -- MAINTENANCE SCHEDULES
  -- Recurring PM schedules for primary machines
  -- ══════════════════════════════════════════════════════════

  INSERT INTO public.maintenance_schedules
    (machine_id, name, description, frequency, interval_days,
     estimated_duration_hours, assigned_to_employee_id, is_active, notes)
  VALUES
    (m_r1, 'PM Semanal Ryobi #1',
     'Limpieza tinteros, revisión mantillas, ajuste registro, lubricación diaria.',
     'weekly', 7, 1.5, e_carlos, true,
     'Lunes pre-turno. Carlos Mendoza responsable.'),
    (m_r1, 'PM Mensual Ryobi #1',
     'Revisión rodillos entintadores, tensión mantilla, ajuste pH fuente, '
     'limpieza tablero eléctrico, calibración densitómetro.',
     'monthly', 30, 4.0, e_carlos, true,
     'Primer lunes del mes. 4 horas. Supervisor presente.'),
    (m_r1, 'PM Trimestral Ryobi #1',
     'Revisión cojinetes, ajuste correas, limpieza profunda sistema de tintas, '
     'calibración completa, verificación eléctrica por técnico externo.',
     'quarterly', 90, 8.0, e_carlos, true,
     'Técnico externo Impresiones S.A. + Carlos. Máquina fuera de servicio 8h.'),
    (m_r2, 'PM Semanal Ryobi #2',
     'Limpieza tinteros, revisión mantillas, ajuste registro, lubricación.',
     'weekly', 7, 1.5, e_jorge, true,
     'Lunes pre-turno. Jorge Ríos responsable.'),
    (m_r2, 'PM Mensual Ryobi #2',
     'Revisión rodillos entintadores, tensión mantilla, ajuste pH fuente.',
     'monthly', 30, 4.0, e_jorge, true,
     'Primer lunes del mes.'),
    (m_r2, 'PM Trimestral Ryobi #2',
     'Revisión cojinetes, ajuste correas, limpieza profunda, calibración.',
     'quarterly', 90, 8.0, e_jorge, true,
     'Técnico externo + Jorge.'),
    (m_dc, 'PM Mensual Die Cutter',
     'Revisión cuchillas, ajuste presión, limpieza sistema de alimentación.',
     'monthly', 30, 3.0, e_miguel, true,
     'Miguel Torres responsable.'),
    (m_g1, 'PM Trimestral Guillotina #1',
     'Afilado cuchilla, revisión guarda de seguridad, lubricación.',
     'quarterly', 90, 2.5, e_ana, true,
     'Ana González responsable.')
  ON CONFLICT DO NOTHING;

  -- ══════════════════════════════════════════════════════════
  -- MAINTENANCE LOGS — PREVENTIVE (12 months)
  -- Weekly + Monthly + Quarterly for both Ryobis
  -- ══════════════════════════════════════════════════════════

  -- RYOBI #1 PREVENTIVE LOGS (May 2025 – Apr 2026)
  -- Weekly samples (every 4 weeks to keep seed manageable)
  INSERT INTO public.maintenance_logs
    (machine_id, log_type, status, performed_by_employee_id,
     performed_at, duration_hours, description, findings, actions_taken,
     next_service_date, parts_replaced, cost)
  VALUES
    -- May 2025
    (m_r1, 'preventive', 'completed', e_carlos,
     '2025-05-05 07:00', 1.5,
     'PM Semanal Ryobi #1 — May sem 1',
     'Todo en orden. Tinteros limpios. Registro ±0.1mm.',
     'Limpieza completa. Lubricación puntos clave.',
     '2025-05-12', NULL, 0),
    (m_r1, 'preventive', 'completed', e_carlos,
     '2025-05-05 08:30', 4.0,
     'PM Mensual Ryobi #1 — Mayo 2025',
     'Rodillos OK. Mantilla tensión 85% (buena). pH fuente 4.8.',
     'Ajuste pH a 5.0. Limpieza tablero. Calibración densitómetro.',
     '2025-06-02', NULL, 0),
    -- June 2025
    (m_r1, 'preventive', 'completed', e_carlos,
     '2025-06-02 07:00', 1.5,
     'PM Semanal Ryobi #1 — Jun sem 1', 'OK.', 'Limpieza rutinaria.', '2025-06-09', NULL, 0),
    (m_r1, 'preventive', 'completed', e_carlos,
     '2025-06-02 08:30', 4.0,
     'PM Mensual Ryobi #1 — Junio 2025',
     'Rodillos entintadores desgaste normal. Mantilla nueva colocada.',
     'Cambio mantilla preventivo (1 unidad). Calibración OK.',
     '2025-07-07', 'Mantilla offset x1 ($95)', 95.00),
    -- July 2025 (pre-crunch check critical)
    (m_r1, 'preventive', 'completed', e_carlos,
     '2025-07-07 07:00', 1.5,
     'PM Semanal Ryobi #1 — Jul sem 1', 'OK.', 'Limpieza rutinaria.', '2025-07-14', NULL, 0),
    (m_r1, 'preventive', 'completed', e_carlos,
     '2025-07-07 08:30', 4.5,
     'PM Mensual + Pre-Crunch Ryobi #1 — Julio 2025',
     'Revisión extendida pre-crunch agosto. Cojinetes OK (desgaste normal). '
     'Correas tensión correcta. pH fuente 5.0.',
     'Lubricación extra cojinetes. Ajuste guías. Limpieza profunda tinteros.',
     '2025-08-04', NULL, 0),
    (m_r1, 'preventive', 'completed', e_carlos,
     '2025-07-28 07:00', 8.0,
     'PM Trimestral Ryobi #1 — Q2 2025 (Jul)',
     'Técnico externo Impresiones S.A. presente. Cojinetes con desgaste normal — '
     'NO crítico. Correas OK. Tablero eléctrico OK. Sistema de tintas OK.',
     'Limpieza profunda completa. Calibración completa. Todo normal.',
     '2025-10-27', NULL, 350.00),
    -- Aug 2025 (crunch — PM reducido)
    (m_r1, 'preventive', 'completed', e_carlos,
     '2025-08-04 06:30', 1.0,
     'PM Semanal Ryobi #1 — Ago sem 1 (pre-crunch)',
     'Revisión rápida. OK para crunch.',
     'Limpieza tinteros. Lubricación rápida.', '2025-08-25', NULL, 0),
    -- Sep 2025
    (m_r1, 'preventive', 'completed', e_carlos,
     '2025-09-01 07:00', 1.5,
     'PM Semanal Ryobi #1 — Sep sem 1 (post-crunch)',
     'Post-crunch: desgaste acelerado en rodillo entintador #2 detectado.',
     'Monitoreo. Programar revisión técnico en Oct.',
     '2025-09-08', NULL, 0),
    (m_r1, 'preventive', 'completed', e_carlos,
     '2025-09-01 08:30', 4.0,
     'PM Mensual Ryobi #1 — Septiembre 2025',
     'Rodillo entintador #2 con rayaduras leves (post-crunch 280h continuas). '
     'No crítico aún. pH fuente 4.9.',
     'Ajuste pH. Nota en bitácora para reemplazo rodillo en próximo trimestral.',
     '2025-10-06', NULL, 0),
    -- Oct 2025
    (m_r1, 'preventive', 'completed', e_carlos,
     '2025-10-06 07:00', 1.5,
     'PM Semanal Ryobi #1 — Oct sem 1', 'OK.', 'Rutina.', '2025-10-13', NULL, 0),
    (m_r1, 'preventive', 'completed', e_carlos,
     '2025-10-27 08:00', 8.5,
     'PM Trimestral Ryobi #1 — Q3 2025 (Oct)',
     'Técnico Impresiones S.A. Cojinetes con desgaste por encima del promedio '
     'pos crunch (400h en 3 meses). Se recomienda próximo trimestral acelerado. '
     'Rodillo entintador #2 reemplazado. Correas OK.',
     'Reemplazo rodillo entintador #2. Lubricación extra cojinetes. '
     'Calibración completa. Técnico recomienda monitorear cojinetes mensualmente.',
     '2026-01-26', 'Rodillo entintador x1 ($480)', 830.00),
    -- Nov 2025 (crunch — Carlos en licencia)
    (m_r1, 'preventive', 'completed', e_jorge,
     '2025-11-03 07:00', 1.5,
     'PM Semanal Ryobi #1 — Nov sem 1 (Jorge pre-licencia Carlos)',
     'Jorge revisa máquina antes del crunch. OK.',
     'Limpieza. Lubricación.', '2025-11-10', NULL, 0),
    -- Dec 2025
    (m_r1, 'preventive', 'completed', e_carlos,
     '2025-12-01 07:00', 4.0,
     'PM Mensual Ryobi #1 — Diciembre 2025',
     'Dic lento. Revisión tranquila. Todo OK. Cojinetes normales.',
     'Limpieza profunda aprovechando baja carga.',
     '2026-01-05', NULL, 0),
    -- Jan 2026
    (m_r1, 'preventive', 'completed', e_carlos,
     '2026-01-05 07:00', 1.5,
     'PM Semanal Ryobi #1 — Ene sem 1 2026', 'OK.', 'Rutina.', '2026-01-12', NULL, 0),
    (m_r1, 'preventive', 'completed', e_carlos,
     '2026-01-26 08:00', 8.5,
     'PM Trimestral Ryobi #1 — Q4 2025 (Ene 2026)',
     'Técnico Impresiones S.A. Cojinetes: desgaste ALTO en cojinete principal '
     'derecho. Técnico recomienda reemplazo en próximos 60 días. '
     'Registrado como alerta. Resto OK.',
     'Lubricación especial cojinete principal. Ajuste correas. Calibración.',
     '2026-04-27', NULL, 420.00),
    -- Feb 2026
    (m_r1, 'preventive', 'completed', e_carlos,
     '2026-02-02 07:00', 4.0,
     'PM Mensual Ryobi #1 — Febrero 2026',
     'Cojinete principal monitorizado. Desgaste avanzando. No crítico aún. '
     'Programado reemplazo en PM trimestral Mar o ante primer síntoma.',
     'Lubricación extra. Nota en bitácora.',
     '2026-03-02', NULL, 0),
    -- Mar 2026 (BEFORE BREAKDOWN)
    (m_r1, 'preventive', 'completed', e_carlos,
     '2026-03-02 07:00', 1.5,
     'PM Semanal Ryobi #1 — Mar sem 1 (pre-crunch Q3)',
     'Ruido leve en cojinete principal. Carlos toma nota. '
     'Comunica a supervisor.',
     'Lubricación extra. Monitoreo estrecho.',
     '2026-03-09', NULL, 0);

  -- RYOBI #2 PREVENTIVE LOGS (condensed)
  INSERT INTO public.maintenance_logs
    (machine_id, log_type, status, performed_by_employee_id,
     performed_at, duration_hours, description, findings, actions_taken,
     next_service_date, parts_replaced, cost)
  VALUES
    (m_r2, 'preventive', 'completed', e_jorge,
     '2025-05-05 07:00', 1.5, 'PM Semanal Ryobi #2 — May', 'OK.', 'Rutina.', '2025-05-12', NULL, 0),
    (m_r2, 'preventive', 'completed', e_jorge,
     '2025-05-05 09:30', 4.0, 'PM Mensual Ryobi #2 — Mayo 2025',
     'Rodillos OK. Mantilla tensión 88%. pH fuente 5.0.',
     'Ajuste menor. Limpieza.', '2025-06-02', NULL, 0),
    (m_r2, 'preventive', 'completed', e_jorge,
     '2025-07-28 12:00', 8.0, 'PM Trimestral Ryobi #2 — Q2 2025',
     'Técnico + Jorge. Todo en excelente estado. Ryobi #2 tiene 30% menos horas que #1.',
     'Limpieza profunda. Calibración.', '2025-10-27', NULL, 320.00),
    (m_r2, 'preventive', 'completed', e_jorge,
     '2025-10-27 12:00', 8.0, 'PM Trimestral Ryobi #2 — Q3 2025',
     'Todo OK. Sin desgaste anormal.', 'Calibración. Limpieza profunda.', '2026-01-26', NULL, 320.00),
    (m_r2, 'preventive', 'completed', e_jorge,
     '2026-01-26 12:00', 8.0, 'PM Trimestral Ryobi #2 — Q4 2025',
     'Cojinetes OK. Todo normal.', 'Calibración. Limpieza.', '2026-04-27', NULL, 320.00),
    (m_r2, 'preventive', 'completed', e_jorge,
     '2026-02-02 09:30', 4.0, 'PM Mensual Ryobi #2 — Feb 2026', 'OK.', 'Rutina.', '2026-03-02', NULL, 0),
    -- Die Cutter
    (m_dc, 'preventive', 'completed', e_miguel,
     '2025-06-02 09:00', 3.0, 'PM Mensual Die Cutter — Jun 2025',
     'Cuchillas OK. Presión 85 kN/m. Alimentación OK.',
     'Limpieza. Ajuste presión a 88 kN/m.', '2025-07-07', NULL, 0),
    (m_dc, 'preventive', 'completed', e_miguel,
     '2025-09-01 09:00', 3.0, 'PM Mensual Die Cutter — Sep 2025',
     'Cuchilla presenta desgaste en zona inferior.',
     'Reemplazo cuchilla inferior. OK.', '2025-10-06', 'Cuchilla inferior x1 ($210)', 210.00),
    (m_dc, 'preventive', 'completed', e_miguel,
     '2026-01-05 09:00', 3.0, 'PM Mensual Die Cutter — Ene 2026', 'OK.', 'Rutina.', '2026-02-02', NULL, 0),
    -- Guillotina #1
    (m_g1, 'preventive', 'completed', e_ana,
     '2025-08-04 11:00', 2.5, 'PM Trimestral Guillotina #1 — Q2 2025',
     'Cuchilla afilada. Guarda de seguridad OK. Lubricación correcta.',
     'Afilado cuchilla. Lubricación completa.', '2025-11-03', NULL, 45.00),
    (m_g1, 'preventive', 'completed', e_ana,
     '2025-11-03 11:00', 2.5, 'PM Trimestral Guillotina #1 — Q3 2025', 'OK.', 'Afilado.', '2026-02-02', NULL, 45.00),
    (m_g1, 'preventive', 'completed', e_ana,
     '2026-02-02 11:00', 2.5, 'PM Trimestral Guillotina #1 — Q4 2025', 'OK.', 'Afilado.', '2026-05-04', NULL, 45.00);

  -- ══════════════════════════════════════════════════════════
  -- CORRECTIVE MAINTENANCE LOGS
  -- Event 1: Aug 2025 crunch — Ryobi #1 quality stop (tintero)
  -- Event 2: Mar 2026 crunch — Ryobi #1 bearing failure ⚠️ CRITICAL
  -- ══════════════════════════════════════════════════════════

  INSERT INTO public.maintenance_logs
    (machine_id, log_type, status, performed_by_employee_id,
     performed_at, duration_hours, description, findings, actions_taken,
     next_service_date, parts_replaced, cost, downtime_hours)
  VALUES
    -- CORRECTIVE #1: Aug 2025 crunch quality stop (Ryobi #2, night shift OT-021)
    (m_r2, 'corrective', 'completed', e_jorge,
     '2025-08-18 19:30', 0.67,
     '🔧 CORRECTIVO: Rayadura en tinteros Ryobi #2 — turno noche OT-2025-021',
     'Contaminación en tintero negro. 1.500 etiquetas rayadas descartadas.',
     'Parada de máquina. Limpieza completa tintero negro. '
     'Prueba de muestra supervisada por Eduardo. Reanudación 20:10.',
     '2025-08-25', NULL, 0, 0.67),

    -- CORRECTIVE #2: Mar 2026 — CRITICAL breakdown Ryobi #1 (MAIN EVENT)
    (m_r1, 'corrective', 'completed', e_carlos,
     '2026-03-11 09:30', 52.5,
     '🚨 CORRECTIVO CRÍTICO: Falla cojinete principal Ryobi #1 — Crunch Q3',
     'Ruido progresivo desde semanas previas. Falla súbita a las 09:30h del '
     '11/03/2026 durante producción OT-2026-011 (LabelCorp NeuroCalm Q3). '
     'Desgaste cojinete principal derecho — documentado en PM enero 2026 como '
     '"desgaste alto, reemplazar en 60 días". Reemplazo no realizado antes del '
     'crunch. Máquina fuera de servicio 09:30h 11/03 → 14:00h 13/03 (52.5h). '
     'Impacto: OT-011 retrasada, OT-013 parcialmente subcontratada, OT-014 '
     'movida a turnos noche para recuperar.',
     'Técnico externo Impresiones S.A. llamado de urgencia. '
     'Reemplazo cojinete principal + preventivo cojinete secundario. '
     'Reemplazo mantilla (aprovechando parada). '
     'Calibración completa post-reparación. Máquina operativa 13/03 14:00h. '
     'LECCIÓN: programar reemplazo de cojinetes ANTES del crunch siguiente.',
     '2026-06-13',
     'Cojinete principal x1 ($580) + cojinete secundario x1 ($320) + mantilla x1 ($97)',
     2497.00,  -- parts + labor + urgency premium + subcontract overhead
     52.5);

  -- ══════════════════════════════════════════════════════════
  -- DOWNTIME LOGS
  -- ══════════════════════════════════════════════════════════

  INSERT INTO public.machine_downtime_logs
    (machine_id, start_time, end_time, reason, reported_by_employee_id,
     resolved_by_employee_id, notes)
  VALUES
    -- Aug 2025 tintero stop (40 min)
    (m_r2, '2025-08-18 19:30', '2025-08-18 20:10',
     'Contaminación tintero negro. Parada calidad OT-021.',
     e_jorge, e_jorge,
     'Resuelto en turno. 40 min downtime. 1500 etiquetas descartadas.'),

    -- Mar 2026 bearing failure (52.5 hours)
    (m_r1, '2026-03-11 09:30', '2026-03-13 14:00',
     'Falla cojinete principal derecho. Parada de emergencia. '
     'Carga redirigida a Ryobi #2 y subcontrato.',
     e_carlos, e_carlos,
     '52.5h downtime. Impacto: 3 OTs afectadas. '
     'Ver correctivo MAINT-CORR-2026-R1-001.')
  ON CONFLICT DO NOTHING;

  -- ══════════════════════════════════════════════════════════
  -- MAINTENANCE ALERTS
  -- 1 resolved (Aug 2025 low stock — cross-ref)
  -- 1 active unresolved alert (current state at seed time)
  -- ══════════════════════════════════════════════════════════

  INSERT INTO public.maintenance_alerts
    (machine_id, alert_type, severity, title, description,
     is_resolved, resolved_at, resolved_by_employee_id, created_at)
  VALUES
    -- RESOLVED: Jan 2026 bearing warning (led to Mar 2026 breakdown)
    (m_r1, 'desgaste', 'high',
     'Desgaste alto en cojinete principal Ryobi #1',
     'PM Trimestral Q4 2025 (26-ene-2026): técnico Impresiones S.A. detectó '
     'desgaste alto en cojinete principal derecho. Recomienda reemplazo en '
     'próximos 60 días. Si no se reemplaza antes del crunch de marzo, existe '
     'riesgo de falla en producción.',
     true, '2026-03-13 15:00', e_supervisor,
     '2026-01-26 17:00'),

    -- RESOLVED: Aug 2025 emergency stock alert
    (NULL, 'stock', 'critical',
     '🚨 Stock couche adhesivo 80gsm en mínimo crítico',
     'Stock de couche adhesivo 80gsm alcanzó 42kg el 18/08/2025 '
     '(punto de reorden: 500kg). OT-2025-021 en riesgo de paralización. '
     'Compra emergencia ejecutada.',
     true, '2025-08-19 14:00', e_supervisor,
     '2025-08-18 20:30'),

    -- ACTIVE UNRESOLVED: Ryobi #2 rodillo entintador
    (m_r2, 'desgaste', 'medium',
     'Rodillo entintador #3 Ryobi #2 — desgaste moderado',
     'Detectado en PM mensual febrero 2026: rodillo entintador #3 presenta '
     'rayaduras superficiales. No afecta calidad actual pero requiere '
     'monitoreo. Reemplazar en PM trimestral abril 2026 o antes si se '
     'detectan manchas en producción.',
     false, NULL, NULL,
     '2026-02-02 14:00'),

    -- ACTIVE UNRESOLVED: General PM reminder upcoming
    (m_r1, 'preventivo', 'low',
     'PM Trimestral Ryobi #1 — programar para Abr 2026',
     'Próximo PM trimestral de Ryobi #1 vence 27-abr-2026. '
     'Coordinar con técnico externo con anticipación dado el crunch '
     'de mayo-junio 2026 proyectado.',
     false, NULL, NULL,
     '2026-04-01 08:00')
  ON CONFLICT DO NOTHING;

  -- ══════════════════════════════════════════════════════════
  -- PROGRAM TASK LOGS
  -- Weekly/monthly PM task completion records (12 months)
  -- Uses maintenance_program tasks from migration
  -- Resolves program IDs dynamically if table exists
  -- ══════════════════════════════════════════════════════════

  -- Insert program task completion logs if maintenance_programs table exists
  -- and we can find the program IDs. Gracefully skip if not found.
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'maintenance_programs'
  ) THEN
    SELECT id INTO prog_r1_weekly
    FROM public.maintenance_programs
    WHERE lower(name) LIKE '%ryobi%1%semanal%'
       OR lower(name) LIKE '%ryobi%#1%weekly%'
    LIMIT 1;

    SELECT id INTO prog_r1_monthly
    FROM public.maintenance_programs
    WHERE lower(name) LIKE '%ryobi%1%mensual%'
       OR lower(name) LIKE '%ryobi%#1%monthly%'
    LIMIT 1;

    IF prog_r1_weekly IS NOT NULL THEN
      INSERT INTO public.program_task_logs
        (program_id, week_start, day_of_week, completed, completed_by, completed_at, notes)
      VALUES
        (prog_r1_weekly, '2025-05-05', 'monday',    true,  e_carlos, '2025-05-05 08:45', NULL),
        (prog_r1_weekly, '2025-05-12', 'monday',    true,  e_carlos, '2025-05-12 08:30', NULL),
        (prog_r1_weekly, '2025-05-19', 'monday',    true,  e_carlos, '2025-05-19 08:40', NULL),
        (prog_r1_weekly, '2025-05-26', 'monday',    true,  e_carlos, '2025-05-26 08:35', NULL),
        (prog_r1_weekly, '2025-06-02', 'monday',    true,  e_carlos, '2025-06-02 08:30', NULL),
        (prog_r1_weekly, '2025-06-09', 'monday',    true,  e_carlos, '2025-06-09 08:45', NULL),
        (prog_r1_weekly, '2025-07-07', 'monday',    true,  e_carlos, '2025-07-07 08:30', NULL),
        (prog_r1_weekly, '2025-07-14', 'monday',    true,  e_carlos, '2025-07-14 08:35', NULL),
        -- Crunch Aug: PM completado pero rápido
        (prog_r1_weekly, '2025-08-04', 'monday',    true,  e_carlos, '2025-08-04 06:45',
         'PM reducido 1h por inicio crunch.'),
        -- Nov crunch: Jorge cubre a Carlos
        (prog_r1_weekly, '2025-11-03', 'monday',    true,  e_jorge,  '2025-11-03 08:30',
         'Jorge cubre a Carlos (licencia).'),
        (prog_r1_weekly, '2025-11-10', 'monday',    true,  e_jorge,  '2025-11-10 08:40', NULL),
        -- Dec: normal, baja carga
        (prog_r1_weekly, '2025-12-01', 'monday',    true,  e_carlos, '2025-12-01 08:30', NULL),
        (prog_r1_weekly, '2025-12-08', 'monday',    true,  e_carlos, '2025-12-08 08:35', NULL),
        -- 2026
        (prog_r1_weekly, '2026-01-05', 'monday',    true,  e_carlos, '2026-01-05 08:30', NULL),
        (prog_r1_weekly, '2026-02-02', 'monday',    true,  e_carlos, '2026-02-02 08:30', NULL),
        -- Mar 2026: PM realizado pero breakdown ocurrió en día 11
        (prog_r1_weekly, '2026-03-02', 'monday',    true,  e_carlos, '2026-03-02 08:35',
         'Detecta ruido leve cojinete. Informa a supervisor.'),
        -- Week of breakdown: NOT completed (machine was down)
        (prog_r1_weekly, '2026-03-09', 'monday',    false, NULL, NULL,
         'PM NO REALIZADO. Máquina parada por avería cojinete 11–13 mar.'),
        -- Apr 2026: recovery
        (prog_r1_weekly, '2026-04-06', 'monday',    true,  e_carlos, '2026-04-06 08:30', NULL),
        (prog_r1_weekly, '2026-04-13', 'monday',    true,  e_carlos, '2026-04-13 08:35', NULL)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

END $$;
