-- ============================================================================
-- FSSC 22000 one-up traceability: link material lots to their purchase order
-- ----------------------------------------------------------------------------
-- Today inventory_lots only carries a free-text supplier_name. To complete the
-- backward trace (consumed lot -> OC -> supplier), we link each lot to the
-- purchase (orden de compra) it arrived on, and record the supplier's RUT/giro
-- on the purchase for FSSC supplier identification + Chilean DTE.
--
-- Safe/idempotent (IF NOT EXISTS). Apply, then regenerate types.ts. The
-- Expediente supply line is wired to these columns in a follow-up once present.
-- ============================================================================

-- 1) Lot -> Órden de Compra link --------------------------------------------
alter table public.inventory_lots
  add column if not exists purchase_id uuid references public.purchases(id) on delete set null;

create index if not exists inventory_lots_purchase_id_idx
  on public.inventory_lots (purchase_id);

comment on column public.inventory_lots.purchase_id is
  'OC (purchases) this lot was received on — FSSC 22000 one-up traceability.';

-- 2) Supplier identity on the purchase (for FSSC + Chilean DTE) --------------
alter table public.purchases
  add column if not exists supplier_rut  text,
  add column if not exists supplier_giro text;

comment on column public.purchases.supplier_rut is
  'Supplier RUT — FSSC supplier identification / Chilean factura (DTE).';

-- 3) Optional: purchase line items (incoming-goods detail) -------------------
--    Enables item-level OC ↔ lot reconciliation. Kept minimal; expand later.
create table if not exists public.purchase_items (
  id          uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  item_id     uuid references public.inventory_items(id) on delete set null,
  lot_id      uuid references public.inventory_lots(id) on delete set null,
  description text,
  quantity    numeric not null default 0,
  unit_cost   numeric,
  created_at  timestamptz not null default now()
);

create index if not exists purchase_items_purchase_id_idx on public.purchase_items (purchase_id);
create index if not exists purchase_items_lot_id_idx      on public.purchase_items (lot_id);

comment on table public.purchase_items is
  'Line items of a purchase (orden de compra); links OC ↔ item ↔ lot for FSSC incoming-goods traceability.';

-- NOTE: RLS — purchase_items should inherit the same policy posture as purchases
-- (server/service-role writes via API; authenticated reads). Add policies to
-- match your existing purchases policies when you apply this.
