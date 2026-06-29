-- ============================================================
-- SEED 12 — Sales ownership (so the vendedor view is alive)
--
-- C1.3 scopes a `vendedor` to rows they own: clients/OTs/VBs where
-- salesman_id = their employees.id. For the demo to SHOW that, the existing
-- demo clients & OTs need an owner. This splits the book of business between
-- the two demo salesmen (matching the seed_11 quote assignments):
--
--   Eduardo   → LabelCorp, Distribuidora Global, Comercial Norte
--   Valentina → PackBrands, Farmavida, Inversiones del Sur, Express Retail
--
-- Run order: AFTER seed_03 (clients), seed_09 (OTs), seed_11 (VBs) and the
-- C1 migrations. Safe to re-run: YES (UPDATEs keyed by rut/client_id; OT
-- ownership only fills NULLs so it never clobbers converted-OT ownership).
--
-- ⚠️  The auth↔employee link is NOT done here — see the block at the bottom.
-- ============================================================

DO $$
DECLARE
  s_a UUID;  -- Eduardo
  s_b UUID;  -- Valentina
BEGIN
  SELECT id INTO s_a FROM public.employees WHERE full_name ILIKE 'Eduardo%'  LIMIT 1;
  SELECT id INTO s_b FROM public.employees WHERE full_name ILIKE 'Valentina%' LIMIT 1;

  IF s_a IS NULL OR s_b IS NULL THEN
    RAISE EXCEPTION 'seed_12: demo salesmen not found (need employees Eduardo%% and Valentina%%).';
  END IF;

  -- 1. Assign the demo clients to their salesman (by RUT).
  UPDATE public.clients SET salesman_id = s_a
    WHERE rut IN ('76.123.456-7', '78.999.888-3', '76.778.334-8');   -- LabelCorp, Distribuidora, Norte
  UPDATE public.clients SET salesman_id = s_b
    WHERE rut IN ('77.654.321-K', '76.445.112-5', '77.002.556-1', '76.101.202-9'); -- PackBrands, Farmavida, Sur, Express

  -- 2. Propagate ownership to OTs from the owning client. Only fill NULLs so a
  --    converted OT (which already carries its VB's salesman_id) is untouched.
  UPDATE public.ots o
    SET salesman_id = c.salesman_id
    FROM public.clients c
    WHERE o.client_id = c.id
      AND c.salesman_id IS NOT NULL
      AND o.salesman_id IS NULL;

  RAISE NOTICE 'seed_12 done: clients & OTs split between Eduardo and Valentina.';
END $$;

-- ============================================================
-- ⚠️  MANUAL STEP — link a vendedor login to a salesman employee
--
-- C1.3 maps auth.uid() → employees.user_id → employees.id (= salesman_id).
-- So a vendedor only sees their book once their auth user is linked to the
-- employee row. After creating the vendedor account (Admin → Usuarios, role
-- 'vendedor'), grab its auth uid and run ONE of these:
--
--   -- Eduardo's login:
--   UPDATE public.employees
--     SET user_id = '<AUTH_UID_OF_VENDEDOR>'
--     WHERE full_name ILIKE 'Eduardo%';
--
--   -- Valentina's login:
--   UPDATE public.employees
--     SET user_id = '<AUTH_UID_OF_VENDEDOR>'
--     WHERE full_name ILIKE 'Valentina%';
--
-- (The auth uid is the user's id in Supabase Auth / the Usuarios list.)
-- ============================================================
