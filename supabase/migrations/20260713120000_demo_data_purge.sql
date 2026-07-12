-- ============================================================
-- P3.1 (demo-readiness plan §Phase 3) — purge poisoned seeds & audit artifacts
--
-- The 2026-07 audit and its verification runs left test data behind, and the
-- original seeds carry rows that poison every dashboard: purchase orders in
-- dollar scale next to CLP millions, a "Mirror Test" capture operator, a 2025
-- machine schedule, and WhatsApp sessions that never close. One sweep, in
-- FK-safe order, all anchored on explicit markers so re-running is harmless.
--
-- Deliberately NOT touched: seeded OTs/VBs/OCs that form coherent CLP-scale
-- stories (the demo seed builds on them), and 2025-named shifts (attendance
-- rows may reference them — renamed by the demo seed instead).
-- ============================================================

-- ── 0. Handy sets ────────────────────────────────────────────
-- Test OTs from the audit + phase verifications.
CREATE TEMP TABLE _purge_ots ON COMMIT DROP AS
SELECT id FROM public.ots
WHERE ot_number IN ('OT-AUDIT-9001', 'OT-TEST-P1', 'OT-TEST-P2');

-- Test lots from the audit + phase verifications (incl. the orphan the lot
-- repair correctly skipped, and the junk lot "2" with cert "EE").
CREATE TEMP TABLE _purge_lots ON COMMIT DROP AS
SELECT id FROM public.inventory_lots
WHERE lot_number IN ('AUDIT-LOT-777', 'TEST-FIX-12', 'TEST-COST-01', '2');

-- Test OCs are marked in their notes; dollar-scale seeds by number.
CREATE TEMP TABLE _purge_purchases ON COMMIT DROP AS
SELECT id FROM public.purchases
WHERE notes LIKE '[AUDIT-TEST]%'
   OR oc_number IN ('OC-00001', 'OC-00002', 'OC-00003', 'OC-00004', 'OC-00005');

-- ── 1. WhatsApp logs from audit/simulator runs ───────────────
-- Simulator traffic hit real OTs 40500/40501 from 2026-07-10 onward; seeded
-- logs are older. Ends first (start_log_id self-reference), then starts.
DELETE FROM public.whatsapp_production_logs
WHERE start_log_id IS NOT NULL
  AND (ot_id IN (SELECT id FROM _purge_ots)
       OR (ot_number IN ('40500', '40501') AND message_timestamp >= '2026-07-10'));

DELETE FROM public.whatsapp_production_logs
WHERE ot_id IN (SELECT id FROM _purge_ots)
   OR (ot_number IN ('40500', '40501') AND message_timestamp >= '2026-07-10');

-- ── 2. Attachment rows ───────────────────────────────────────
-- Test-OT attachments and the simulator's 1×1-px "evidence" on OT 40501.
-- Only the ot_attachments rows are deleted (that's what the app and dossier
-- read). Supabase forbids direct SQL deletes on storage.objects
-- (storage.protect_delete trigger) — the lone orphaned blob is the ~100-byte
-- test pixel, referenced by nothing; remove via the Storage UI if it bothers.
DELETE FROM public.ot_attachments
WHERE ot_id IN (SELECT id FROM _purge_ots)
   OR (filename LIKE 'whatsapp_%'
       AND ot_id IN (SELECT id FROM public.ots WHERE ot_number = '40501'));

-- ── 3. The verification cost line on OT 40501 ────────────────
DELETE FROM public.ot_real_costs
WHERE workflow_step = 'oc_receipt' AND operation_code = 'TEST-COST-01';

-- ── 4. Inventory: transactions → lots ────────────────────────
DELETE FROM public.inventory_stock_transactions
WHERE lot_id IN (SELECT id FROM _purge_lots);

DELETE FROM public.inventory_lots
WHERE id IN (SELECT id FROM _purge_lots);

-- ── 5. Purchases: ledger lines → OCs ─────────────────────────
DELETE FROM public.ot_cost_lines
WHERE ref_type = 'oc' AND ref_id IN (SELECT id FROM _purge_purchases);

DELETE FROM public.purchase_invoices
WHERE purchase_id IN (SELECT id FROM _purge_purchases);

DELETE FROM public.purchases
WHERE id IN (SELECT id FROM _purge_purchases);

-- ── 6. Test OTs (real_costs/history/operations cascade) ──────
DELETE FROM public.ot_machine_schedule
WHERE ot_id IN (SELECT id FROM _purge_ots);

DELETE FROM public.ots
WHERE id IN (SELECT id FROM _purge_ots);

-- ── 7. Junk capture operator + 2025 machine schedule ─────────
DELETE FROM public.capture_events WHERE operator_name = 'Mirror Test';

DELETE FROM public.ot_machine_schedule WHERE scheduled_start < '2026-01-01';

-- ── 8. Zombie sessions: fix the definition, not the history ──
-- "Active" now means: an unclosed, non-cancelled start within the last 12
-- hours (a session older than a shift is expired, not active). The 57
-- eternally-open starts stop polluting the dashboard without mutating logs.
CREATE OR REPLACE VIEW public.whatsapp_active_sessions AS
SELECT
  s.id as start_id,
  s.ot_number,
  s.operator_phone,
  s.operator_name,
  s.operator_employee_id,
  s.message_timestamp as started_at,
  EXTRACT(EPOCH FROM (now() - s.message_timestamp)) / 60 as minutes_elapsed,
  s.ot_id
FROM public.whatsapp_production_logs s
WHERE s.message_type = 'start'
  AND s.review_status <> 'rejected'
  AND s.message_timestamp > now() - interval '12 hours'
  AND NOT EXISTS (
    SELECT 1 FROM public.whatsapp_production_logs e
    WHERE e.start_log_id = s.id
      AND e.message_type = 'end'
  );
