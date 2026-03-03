-- =============================================================
-- OT Professional Upgrade: Specifications, Operations & Pricing
-- Adds product specs, finishing options, auto-calc fields,
-- per-operation cost breakdown, and pricing/margin data.
-- =============================================================

-- ─── New ENUM types ──────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ot_product_type') THEN
    CREATE TYPE public.ot_product_type AS ENUM (
      'etiqueta',
      'caja_display',
      'caja_plegadiza',
      'volante',
      'afiche',
      'brochure',
      'carpeta',
      'sobre',
      'bolsa',
      'otro'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ot_substrate_type') THEN
    CREATE TYPE public.ot_substrate_type AS ENUM (
      'cauche',
      'bond',
      'couche',
      'cartulina',
      'kraft',
      'adhesivo',
      'vinilo',
      'otro'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ot_color_mode') THEN
    CREATE TYPE public.ot_color_mode AS ENUM (
      'cmyk',
      '1_color',
      '2_color',
      '3_color',
      'cmyk_pantone',
      'sin_impresion'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ot_priority_level') THEN
    CREATE TYPE public.ot_priority_level AS ENUM (
      'baja',
      'normal',
      'alta',
      'urgente'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ot_operation_category') THEN
    CREATE TYPE public.ot_operation_category AS ENUM (
      'materiales',
      'impresion',
      'terminaciones',
      'tercerizado',
      'otros'
    );
  END IF;
END $$;

-- ─── Extend ots table with product & spec columns ───────────

ALTER TABLE public.ots
  ADD COLUMN IF NOT EXISTS product_name TEXT,
  ADD COLUMN IF NOT EXISTS product_type public.ot_product_type,
  ADD COLUMN IF NOT EXISTS priority_level public.ot_priority_level NOT NULL DEFAULT 'normal',
  -- Dimensions
  ADD COLUMN IF NOT EXISTS width_cm NUMERIC(8,2) CHECK (width_cm IS NULL OR width_cm >= 0),
  ADD COLUMN IF NOT EXISTS height_cm NUMERIC(8,2) CHECK (height_cm IS NULL OR height_cm >= 0),
  -- Substrate
  ADD COLUMN IF NOT EXISTS substrate_type public.ot_substrate_type,
  ADD COLUMN IF NOT EXISTS grammage_gsm INTEGER CHECK (grammage_gsm IS NULL OR grammage_gsm > 0),
  ADD COLUMN IF NOT EXISTS substrate_brand TEXT,
  ADD COLUMN IF NOT EXISTS substrate_supplier TEXT,
  -- Colors
  ADD COLUMN IF NOT EXISTS color_front public.ot_color_mode DEFAULT 'cmyk',
  ADD COLUMN IF NOT EXISTS color_back public.ot_color_mode DEFAULT 'sin_impresion',
  ADD COLUMN IF NOT EXISTS pantone_colors TEXT[], -- e.g. ARRAY['Pantone 485 C', 'Pantone 300 C']
  -- Finishes (boolean flags)
  ADD COLUMN IF NOT EXISTS finish_troquelado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finish_plegado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finish_pegado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finish_laminado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finish_barniz BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finish_relieve BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finish_perforado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finish_hot_stamping BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finish_uv_localizado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finish_numeracion BOOLEAN NOT NULL DEFAULT false,
  -- Calculations (auto-computed, stored for audit)
  ADD COLUMN IF NOT EXISTS calc_sheets INTEGER CHECK (calc_sheets IS NULL OR calc_sheets >= 0),
  ADD COLUMN IF NOT EXISTS calc_substrate_kg NUMERIC(10,2) CHECK (calc_substrate_kg IS NULL OR calc_substrate_kg >= 0),
  ADD COLUMN IF NOT EXISTS calc_ink_kg NUMERIC(10,3) CHECK (calc_ink_kg IS NULL OR calc_ink_kg >= 0),
  ADD COLUMN IF NOT EXISTS calc_plates INTEGER CHECK (calc_plates IS NULL OR calc_plates >= 0),
  ADD COLUMN IF NOT EXISTS calc_print_hours NUMERIC(8,2) CHECK (calc_print_hours IS NULL OR calc_print_hours >= 0),
  ADD COLUMN IF NOT EXISTS calc_finish_hours NUMERIC(8,2) CHECK (calc_finish_hours IS NULL OR calc_finish_hours >= 0),
  -- Pricing
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margin_pct NUMERIC(5,2) DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS margin_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS increment_pct NUMERIC(5,2) DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS increment_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2) DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_price NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,4) DEFAULT 0,
  -- Meta
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ─── OT Operations (per-operation cost line items) ──────────

CREATE TABLE IF NOT EXISTS public.ot_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id UUID NOT NULL REFERENCES public.ots(id) ON DELETE CASCADE,
  category public.ot_operation_category NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'unit', -- kg, unit, hours, etc.
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  total_cost NUMERIC(12,2) GENERATED ALWAYS AS (ROUND(quantity * unit_cost, 2)) STORED,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ot_operations_ot_id ON public.ot_operations(ot_id);

-- RLS
ALTER TABLE public.ot_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view OT operations" ON public.ot_operations;
CREATE POLICY "Authenticated users can view OT operations"
ON public.ot_operations FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Supervisors can manage OT operations" ON public.ot_operations;
CREATE POLICY "Supervisors can manage OT operations"
ON public.ot_operations FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
);

-- Trigger to keep updated_at fresh
DROP TRIGGER IF EXISTS update_ot_operations_updated_at ON public.ot_operations;
CREATE TRIGGER update_ot_operations_updated_at
BEFORE UPDATE ON public.ot_operations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Recalculate OT subtotal from operations ────────────────

CREATE OR REPLACE FUNCTION public.recalc_ot_subtotal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ot_id UUID;
  v_subtotal NUMERIC(12,2);
BEGIN
  v_ot_id := COALESCE(NEW.ot_id, OLD.ot_id);

  SELECT COALESCE(SUM(ROUND(quantity * unit_cost, 2)), 0)
  INTO v_subtotal
  FROM public.ot_operations
  WHERE ot_id = v_ot_id;

  UPDATE public.ots
  SET subtotal = v_subtotal,
      margin_amount = ROUND(v_subtotal * margin_pct / 100, 2),
      increment_amount = ROUND((v_subtotal + ROUND(v_subtotal * margin_pct / 100, 2)) * increment_pct / 100, 2),
      commission_amount = ROUND(
        (v_subtotal
         + ROUND(v_subtotal * margin_pct / 100, 2)
         + ROUND((v_subtotal + ROUND(v_subtotal * margin_pct / 100, 2)) * increment_pct / 100, 2)
        ) * commission_pct / 100,
        2
      ),
      total_price = v_subtotal
        + ROUND(v_subtotal * margin_pct / 100, 2)
        + ROUND((v_subtotal + ROUND(v_subtotal * margin_pct / 100, 2)) * increment_pct / 100, 2)
        + ROUND(
            (v_subtotal
             + ROUND(v_subtotal * margin_pct / 100, 2)
             + ROUND((v_subtotal + ROUND(v_subtotal * margin_pct / 100, 2)) * increment_pct / 100, 2)
            ) * commission_pct / 100,
            2
          ),
      unit_price = CASE
        WHEN quantity > 0 THEN ROUND(
          (v_subtotal
           + ROUND(v_subtotal * margin_pct / 100, 2)
           + ROUND((v_subtotal + ROUND(v_subtotal * margin_pct / 100, 2)) * increment_pct / 100, 2)
           + ROUND(
               (v_subtotal
                + ROUND(v_subtotal * margin_pct / 100, 2)
                + ROUND((v_subtotal + ROUND(v_subtotal * margin_pct / 100, 2)) * increment_pct / 100, 2)
               ) * commission_pct / 100,
               2
             )
          ) / quantity,
          4
        )
        ELSE 0
      END,
      updated_at = now()
  WHERE id = v_ot_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_ot_subtotal_insert ON public.ot_operations;
CREATE TRIGGER trg_recalc_ot_subtotal_insert
AFTER INSERT ON public.ot_operations
FOR EACH ROW
EXECUTE FUNCTION public.recalc_ot_subtotal();

DROP TRIGGER IF EXISTS trg_recalc_ot_subtotal_update ON public.ot_operations;
CREATE TRIGGER trg_recalc_ot_subtotal_update
AFTER UPDATE ON public.ot_operations
FOR EACH ROW
EXECUTE FUNCTION public.recalc_ot_subtotal();

DROP TRIGGER IF EXISTS trg_recalc_ot_subtotal_delete ON public.ot_operations;
CREATE TRIGGER trg_recalc_ot_subtotal_delete
AFTER DELETE ON public.ot_operations
FOR EACH ROW
EXECUTE FUNCTION public.recalc_ot_subtotal();

-- ─── Auto-generate OT number ────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_ot_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year TEXT;
  v_seq INTEGER;
  v_number TEXT;
BEGIN
  v_year := TO_CHAR(NOW(), 'YYYY');
  
  SELECT COALESCE(MAX(
    CASE
      WHEN ot_number ~ ('^OT-' || v_year || '-\d+$')
      THEN CAST(SPLIT_PART(ot_number, '-', 3) AS INTEGER)
      ELSE 0
    END
  ), 0) + 1
  INTO v_seq
  FROM public.ots;
  
  v_number := 'OT-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
  RETURN v_number;
END;
$$;
