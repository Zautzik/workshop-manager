-- Fix: Link orphaned workstations ↔ machines
-- Run with: npx supabase db query --linked -f supabase/seeds/_fix_machine_ws_links.sql

DO $$
DECLARE
  -- workstation IDs
  ws_off1 UUID; ws_off2 UUID; ws_dc1 UUID; ws_g1 UUID; ws_pp UUID;
  ws_wk1 UUID; ws_wk2 UUID; ws_wk3 UUID; ws_wk4 UUID; ws_wk5 UUID;
  -- machine IDs
  m_off3 UUID; m_dp UUID; m_pps UUID;
  m_g2 UUID;
  m_troqueladora UUID;
  m_mw UUID; m_mw2 UUID; m_mw3 UUID; m_mw4 UUID; m_mw5 UUID;
BEGIN
  -- ── Get workstation IDs ──────────────────────────────────
  SELECT id INTO ws_off1 FROM public.workstations WHERE name = 'Offset Printer 1'   LIMIT 1;
  SELECT id INTO ws_off2 FROM public.workstations WHERE name = 'Offset Printer 2'   LIMIT 1;
  SELECT id INTO ws_dc1  FROM public.workstations WHERE name = 'Die Cutter 1'       LIMIT 1;
  SELECT id INTO ws_g1   FROM public.workstations WHERE name = 'Guillotine 1'       LIMIT 1;
  SELECT id INTO ws_pp   FROM public.workstations WHERE name = 'Pre-Prensa'         LIMIT 1;
  SELECT id INTO ws_wk1  FROM public.workstations WHERE name = 'Workshop Station 1' LIMIT 1;
  SELECT id INTO ws_wk2  FROM public.workstations WHERE name = 'Workshop Station 2' LIMIT 1;
  SELECT id INTO ws_wk3  FROM public.workstations WHERE name = 'Workshop Station 3' LIMIT 1;
  SELECT id INTO ws_wk4  FROM public.workstations WHERE name = 'Workshop Station 4' LIMIT 1;
  SELECT id INTO ws_wk5  FROM public.workstations WHERE name = 'Workshop Station 5' LIMIT 1;

  -- ── Get machine IDs ──────────────────────────────────────
  SELECT id INTO m_off3        FROM public.machines WHERE name = 'Offset Printer 3'       LIMIT 1;
  SELECT id INTO m_dp          FROM public.machines WHERE name = 'Digital Printer'         LIMIT 1;
  SELECT id INTO m_pps         FROM public.machines WHERE name = 'Pre-Press Station'       LIMIT 1;
  SELECT id INTO m_g2          FROM public.machines WHERE lower(name) = 'guillotine #2'    LIMIT 1;
  SELECT id INTO m_troqueladora FROM public.machines WHERE type = 'die_cutter'             LIMIT 1;
  SELECT id INTO m_mw          FROM public.machines WHERE name = 'Manual Workshop'         LIMIT 1;
  SELECT id INTO m_mw2         FROM public.machines WHERE name = 'Manual Workstation #2'   LIMIT 1;
  SELECT id INTO m_mw3         FROM public.machines WHERE name = 'Manual Workstation #3'   LIMIT 1;
  SELECT id INTO m_mw4         FROM public.machines WHERE name = 'Manual Workstation #4'   LIMIT 1;
  SELECT id INTO m_mw5         FROM public.machines WHERE name = 'Manual Workstation #5'   LIMIT 1;

  -- ── 1. Offset Printer 1 ↔ Offset Printer 3 (full bidirectional) ─────────
  IF ws_off1 IS NOT NULL AND m_off3 IS NOT NULL THEN
    UPDATE public.workstations SET machine_id   = m_off3  WHERE id = ws_off1;
    UPDATE public.machines      SET workstation_id = ws_off1 WHERE id = m_off3;
  END IF;

  -- ── 2. Pre-Prensa ↔ Pre-Press Station (full bidirectional) ──────────────
  IF ws_pp IS NOT NULL AND m_pps IS NOT NULL THEN
    UPDATE public.workstations SET machine_id   = m_pps WHERE id = ws_pp;
    UPDATE public.machines      SET workstation_id = ws_pp WHERE id = m_pps;
  END IF;

  -- ── 3. Digital Printer → Offset Printer 2 (machine gets a home) ─────────
  IF ws_off2 IS NOT NULL AND m_dp IS NOT NULL THEN
    UPDATE public.workstations SET machine_id   = m_dp    WHERE id = ws_off2;
    UPDATE public.machines      SET workstation_id = ws_off2 WHERE id = m_dp;
  END IF;

  -- ── 4. Guillotine 1 → Guillotine #2 (ws gets machine ref; machine keeps Puesto Corte) ──
  IF ws_g1 IS NOT NULL AND m_g2 IS NOT NULL THEN
    UPDATE public.workstations SET machine_id = m_g2 WHERE id = ws_g1;
  END IF;

  -- ── 5. Die Cutter 1 → Troqueladora (ws gets machine ref; machine keeps Puesto Troquelado) ──
  IF ws_dc1 IS NOT NULL AND m_troqueladora IS NOT NULL THEN
    UPDATE public.workstations SET machine_id = m_troqueladora WHERE id = ws_dc1;
  END IF;

  -- ── 6. Workshop Stations 1-5 → Manual Workstations ──────────────────────
  IF ws_wk1 IS NOT NULL AND m_mw  IS NOT NULL THEN
    UPDATE public.workstations SET machine_id = m_mw  WHERE id = ws_wk1;
  END IF;
  IF ws_wk2 IS NOT NULL AND m_mw2 IS NOT NULL THEN
    UPDATE public.workstations SET machine_id = m_mw2 WHERE id = ws_wk2;
  END IF;
  IF ws_wk3 IS NOT NULL AND m_mw3 IS NOT NULL THEN
    UPDATE public.workstations SET machine_id = m_mw3 WHERE id = ws_wk3;
  END IF;
  IF ws_wk4 IS NOT NULL AND m_mw4 IS NOT NULL THEN
    UPDATE public.workstations SET machine_id = m_mw4 WHERE id = ws_wk4;
  END IF;
  IF ws_wk5 IS NOT NULL AND m_mw5 IS NOT NULL THEN
    UPDATE public.workstations SET machine_id = m_mw5 WHERE id = ws_wk5;
  END IF;

END $$;

-- Verify results
SELECT
  w.name  AS workstation,
  w.type,
  m.name  AS machine,
  m.type  AS machine_type
FROM public.workstations w
LEFT JOIN public.machines m ON m.id = w.machine_id
ORDER BY w.type, w.name;
