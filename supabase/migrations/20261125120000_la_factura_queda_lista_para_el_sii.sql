-- La factura queda lista para el SII (Nubox, integración futura) — 2026-11-25
--
-- Hoy una factura de venta es un registro interno: nada llega al SII. Esta
-- migración agrega lo que un DTE necesita y no existía, SIN cambiar cómo se
-- factura hoy. Todo es nullable o tiene default: con la emisión apagada
-- (DTE_PROVIDER sin definir) ninguna ruta lee ni escribe estas columnas.
--
-- 1. Del cliente, lo que el SII exige del receptor y la ficha no tenía:
--    giro, región y comuna (código de 5 dígitos, ej. 13101 Santiago).
-- 2. De la factura y de la guía: el tipo de DTE, el estado en el SII, el folio
--    que asigna el SII, el id del documento en el proveedor, la llave de
--    idempotencia (se guarda ANTES de llamar, así un reintento no emite dos
--    veces) y los errores tal como los devolvió el proveedor.
-- 3. De la guía: los RUT de transportista y chofer, y la comuna de destino,
--    que una guía electrónica exige y la tabla no registraba.

alter table public.clients
  add column if not exists giro text,
  add column if not exists region_code text,
  add column if not exists comuna_code text;

alter table public.clients
  add constraint clients_comuna_code_formato check (comuna_code is null or comuna_code ~ '^\d{5}$') not valid,
  add constraint clients_region_code_formato check (region_code is null or region_code ~ '^\d{1,2}$') not valid;

do $$ begin
  create type public.dte_status as enum ('not_sent', 'pending', 'accepted', 'rejected', 'error');
exception when duplicate_object then null; end $$;

alter table public.sales_invoices
  add column if not exists dte_type smallint,
  add column if not exists dte_status public.dte_status not null default 'not_sent',
  add column if not exists dte_provider text,
  add column if not exists dte_provider_id text,
  add column if not exists dte_folio text,
  add column if not exists dte_idempotency_key uuid,
  add column if not exists dte_errors jsonb,
  add column if not exists dte_sent_at timestamptz,
  add column if not exists dte_checked_at timestamptz;

alter table public.dispatch_guides
  add column if not exists dte_type smallint,
  add column if not exists dte_status public.dte_status not null default 'not_sent',
  add column if not exists dte_provider text,
  add column if not exists dte_provider_id text,
  add column if not exists dte_folio text,
  add column if not exists dte_idempotency_key uuid,
  add column if not exists dte_errors jsonb,
  add column if not exists dte_sent_at timestamptz,
  add column if not exists dte_checked_at timestamptz,
  add column if not exists carrier_rut text,
  add column if not exists driver_rut text,
  add column if not exists driver_name text,
  add column if not exists destination_comuna_code text;

-- Un folio del SII es único por tipo de documento.
create unique index if not exists sales_invoices_dte_folio_uq
  on public.sales_invoices (dte_type, dte_folio) where dte_folio is not null;
create unique index if not exists dispatch_guides_dte_folio_uq
  on public.dispatch_guides (dte_type, dte_folio) where dte_folio is not null;
-- La llave de idempotencia no se reutiliza entre documentos.
create unique index if not exists sales_invoices_dte_idem_uq
  on public.sales_invoices (dte_idempotency_key) where dte_idempotency_key is not null;
create unique index if not exists dispatch_guides_dte_idem_uq
  on public.dispatch_guides (dte_idempotency_key) where dte_idempotency_key is not null;

comment on column public.clients.giro is 'Giro (actividad principal) del cliente; obligatorio para emitir factura electrónica. Máx. 40 caracteres en el DTE.';
comment on column public.clients.comuna_code is 'Código de comuna de 5 dígitos (ej. 13101) para el DTE.';
comment on column public.sales_invoices.dte_idempotency_key is 'Se escribe antes de llamar al proveedor; un reintento usa la misma llave y no emite dos veces.';
