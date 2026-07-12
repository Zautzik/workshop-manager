-- ============================================================
-- SET1 — app_settings (key-value) + cost-overrun alert threshold
--
-- A small reusable settings store so the admin can configure things like the
-- OT cost-overrun alert threshold (audit #26's last honest placeholder). The
-- alert itself is computed live from ot_cost_summary in the API.
--
-- Additive + idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_app_settings_updated_at ON public.app_settings;
CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Default: alert when an OT's actual cost exceeds its estimate by ≥ 15%.
INSERT INTO public.app_settings (key, value)
VALUES ('cost_overrun_threshold_pct', '15'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ─── RLS (authenticated read, admin manage) ──────────────────
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view app settings" ON public.app_settings;
CREATE POLICY "Authenticated can view app settings"
ON public.app_settings FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins manage app settings" ON public.app_settings;
CREATE POLICY "Admins manage app settings"
ON public.app_settings FOR ALL USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
);

COMMENT ON TABLE public.app_settings IS
  'Key-value app settings (e.g. cost_overrun_threshold_pct). Read broadly, written by admin/manager.';
