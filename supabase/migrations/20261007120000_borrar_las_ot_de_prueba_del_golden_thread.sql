-- Borrar las OTs de prueba dejadas por la auditoría "Golden Thread Trace"
--
-- 41232 ("Aceites Trumao — Etiqueta prueba de flujo", pre_press), 41233/
-- 41238/41239 ("QA STRESS TEST — Etiquetas Nuble SpA", offset_printing /
-- paper_purchase / in_storage) son filas reales dejadas por un mock run de
-- Cotización → Pre-Prensa → Kanban el 2026-08-30/31. 41233 incluso aparece
-- en la "Vía Rápida — Urgentes" del Kanban, donde un técnico real las vería.
-- Su propio campo `notes` dice "Seguro de borrar." Confirmado por el usuario
-- el 2026-10-07 antes de tocar nada.
--
-- Todas las FK hacia public.ots(id) en este esquema son ON DELETE CASCADE o
-- ON DELETE SET NULL (sin una sola RESTRICT) — un DELETE simple cascada
-- limpio por ot_financials/ot_operations/ot_attachments/ot_approvals/
-- ot_real_costs/ot_machine_schedule/ot_state_transitions/ot_status_history/
-- ot_cost_lines/ot_requirements/inventory_reservations/ot_stage_reports, y
-- sólo desvincula (ot_id → NULL) vistos_buenos, purchases, sales_invoices,
-- dispatch_guides, capture_events, domain_events, worker_assignments,
-- inventory_stock_transactions.work_order_id y las tablas de tracking de
-- WhatsApp. El 41233 era el único miembro de su split_group_id — no deja un
-- hermano "B" huérfano.
--
-- Primer intento de push falló: 41233 tiene dos OCs YA EMITIDAS Y ANULADAS
-- colgando (OC-00024, OC-00025 — mismo stress test, supplier "Papelera Demo
-- SpA", notes "STRESS TEST..."), y `trg_oc_emitida_no_se_edita` congela
-- ot_id/oc_number/montos/proveedor incluso en una OC ya cancelled (sólo
-- libera el UPDATE que la cancela, no los que vengan después) — el SET NULL
-- en cascada sobre purchases.ot_id cae justo en ese freeze. Se borran esas
-- dos OCs directo (DELETE, no UPDATE: el trigger es BEFORE UPDATE, no lo
-- toca) antes de tocar la OT. Ambas con lotes=0, invoice_count=0 — pasarían
-- el guard del propio endpoint DELETE de purchases igual. La tercera
-- purchase ligada a este lote (draft, sin oc_number, proveedor real
-- "Papeles Bío Bío", ligada a 41232) se deja intacta: un draft se edita
-- libre (el trigger la deja pasar) y no estaba en lo que se pidió borrar.

BEGIN;

DELETE FROM public.purchases
WHERE id IN (
  '455aea2f-b9d3-4714-966c-10d27b5a2f04', -- OC-00024, stress test, cancelled
  'c983586a-f271-4f0c-9888-b0850e5cdd49'  -- OC-00025, stress test, cancelled
);

DELETE FROM public.ots
WHERE id IN (
  '5587c9ca-c071-4503-8c0b-f9f3559cc0ae', -- 41232
  '343846c4-5d96-46b5-919c-e25907eacbc0', -- 41233
  'a6c06879-20b9-45ea-9391-62dbc758c735', -- 41238
  '4f5c4db4-2495-4756-a2ae-d06823c51cfb'  -- 41239
);

COMMIT;
