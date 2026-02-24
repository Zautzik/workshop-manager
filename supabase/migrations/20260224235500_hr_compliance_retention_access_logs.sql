-- HR compliance: access logs + data retention controls
-- Scope: compliance-sensitive HR records

CREATE OR REPLACE FUNCTION public.has_role_name(p_user_id UUID, p_role_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.role::text = p_role_name
  );
$$;

CREATE TABLE IF NOT EXISTS public.hr_compliance_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  access_type TEXT NOT NULL CHECK (access_type IN ('SELECT', 'VIEW_SENSITIVE', 'EXPORT', 'DOWNLOAD')),
  purpose TEXT,
  request_path TEXT,
  request_method TEXT,
  accessed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_hr_compliance_access_logs_table_name ON public.hr_compliance_access_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_hr_compliance_access_logs_employee_id ON public.hr_compliance_access_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_compliance_access_logs_accessed_by ON public.hr_compliance_access_logs(accessed_by);
CREATE INDEX IF NOT EXISTS idx_hr_compliance_access_logs_accessed_at ON public.hr_compliance_access_logs(accessed_at DESC);

COMMENT ON TABLE public.hr_compliance_access_logs IS
'Access log for compliance-sensitive HR records (read/view/export/download events).';

CREATE TABLE IF NOT EXISTS public.hr_data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL UNIQUE,
  retention_days INTEGER NOT NULL CHECK (retention_days > 0),
  enforcement_action TEXT NOT NULL CHECK (enforcement_action IN ('delete', 'archive', 'redact', 'report_only')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_data_retention_policies_active ON public.hr_data_retention_policies(is_active);

COMMENT ON TABLE public.hr_data_retention_policies IS
'Retention policy catalog for compliance-sensitive HR tables.';

DROP TRIGGER IF EXISTS update_hr_data_retention_policies_updated_at ON public.hr_data_retention_policies;
CREATE TRIGGER update_hr_data_retention_policies_updated_at
  BEFORE UPDATE ON public.hr_data_retention_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.hr_data_retention_policies (table_name, retention_days, enforcement_action, notes)
VALUES
  ('hr_compliance_access_logs', 2190, 'delete', 'Retain 6 years of access logs, then purge.'),
  ('hr_sensitive_audit_log', 2555, 'redact', 'Retain audit metadata 7 years; redact payload after retention.'),
  ('hr_documents', 3650, 'archive', 'Archive HR documents older than 10 years unless legal hold is required externally.'),
  ('employment_contracts', 3650, 'report_only', 'Review contract retention before archival/deletion.'),
  ('compensation_rates', 3650, 'report_only', 'Review compensation retention before archival/deletion.'),
  ('leave_requests', 2555, 'report_only', 'Review leave records retention before archival/deletion.'),
  ('employee_incentives', 2555, 'report_only', 'Review incentive retention before archival/deletion.')
ON CONFLICT (table_name) DO UPDATE
SET retention_days = EXCLUDED.retention_days,
    enforcement_action = EXCLUDED.enforcement_action,
    notes = EXCLUDED.notes,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.log_hr_compliance_access(
  p_table_name TEXT,
  p_record_id UUID DEFAULT NULL,
  p_employee_id UUID DEFAULT NULL,
  p_access_type TEXT DEFAULT 'SELECT',
  p_purpose TEXT DEFAULT NULL,
  p_request_path TEXT DEFAULT NULL,
  p_request_method TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access_type TEXT;
BEGIN
  v_access_type := UPPER(COALESCE(p_access_type, 'SELECT'));

  IF v_access_type NOT IN ('SELECT', 'VIEW_SENSITIVE', 'EXPORT', 'DOWNLOAD') THEN
    RAISE EXCEPTION 'Invalid HR access type: %', v_access_type;
  END IF;

  INSERT INTO public.hr_compliance_access_logs (
    table_name,
    record_id,
    employee_id,
    access_type,
    purpose,
    request_path,
    request_method,
    accessed_by,
    metadata
  )
  VALUES (
    p_table_name,
    p_record_id,
    p_employee_id,
    v_access_type,
    p_purpose,
    p_request_path,
    p_request_method,
    auth.uid(),
    COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_hr_compliance_access_logs_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'hr_compliance_access_logs is immutable and cannot be modified';
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_hr_data_retention(
  p_dry_run BOOLEAN DEFAULT true,
  p_reference_time TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  table_name TEXT,
  action TEXT,
  affected_rows BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy RECORD;
  v_affected BIGINT;
BEGIN
  FOR v_policy IN
    SELECT table_name, retention_days, enforcement_action
    FROM public.hr_data_retention_policies
    WHERE is_active = true
    ORDER BY table_name
  LOOP
    v_affected := 0;

    IF v_policy.table_name = 'hr_compliance_access_logs' AND v_policy.enforcement_action = 'delete' THEN
      IF p_dry_run THEN
        SELECT COUNT(*)
        INTO v_affected
        FROM public.hr_compliance_access_logs
        WHERE accessed_at < (p_reference_time - make_interval(days => v_policy.retention_days));
      ELSE
        DELETE FROM public.hr_compliance_access_logs
        WHERE accessed_at < (p_reference_time - make_interval(days => v_policy.retention_days));
        GET DIAGNOSTICS v_affected = ROW_COUNT;
      END IF;

    ELSIF v_policy.table_name = 'hr_sensitive_audit_log' AND v_policy.enforcement_action = 'redact' THEN
      IF p_dry_run THEN
        SELECT COUNT(*)
        INTO v_affected
        FROM public.hr_sensitive_audit_log
        WHERE changed_at < (p_reference_time - make_interval(days => v_policy.retention_days))
          AND (old_data IS NOT NULL OR new_data IS NOT NULL);
      ELSE
        UPDATE public.hr_sensitive_audit_log
        SET old_data = NULL,
            new_data = NULL,
            changed_fields = ARRAY[]::TEXT[]
        WHERE changed_at < (p_reference_time - make_interval(days => v_policy.retention_days))
          AND (old_data IS NOT NULL OR new_data IS NOT NULL);
        GET DIAGNOSTICS v_affected = ROW_COUNT;
      END IF;

    ELSIF v_policy.table_name = 'hr_documents' AND v_policy.enforcement_action = 'archive' THEN
      IF p_dry_run THEN
        SELECT COUNT(*)
        INTO v_affected
        FROM public.hr_documents
        WHERE created_at < (p_reference_time - make_interval(days => v_policy.retention_days))
          AND status <> 'archived'::public.hr_document_status;
      ELSE
        UPDATE public.hr_documents
        SET status = 'archived'::public.hr_document_status,
            updated_at = now()
        WHERE created_at < (p_reference_time - make_interval(days => v_policy.retention_days))
          AND status <> 'archived'::public.hr_document_status;
        GET DIAGNOSTICS v_affected = ROW_COUNT;
      END IF;

    ELSIF v_policy.table_name = 'employment_contracts' THEN
      SELECT COUNT(*)
      INTO v_affected
      FROM public.employment_contracts
      WHERE created_at < (p_reference_time - make_interval(days => v_policy.retention_days));

    ELSIF v_policy.table_name = 'compensation_rates' THEN
      SELECT COUNT(*)
      INTO v_affected
      FROM public.compensation_rates
      WHERE created_at < (p_reference_time - make_interval(days => v_policy.retention_days));

    ELSIF v_policy.table_name = 'leave_requests' THEN
      SELECT COUNT(*)
      INTO v_affected
      FROM public.leave_requests
      WHERE created_at < (p_reference_time - make_interval(days => v_policy.retention_days));

    ELSIF v_policy.table_name = 'employee_incentives' THEN
      SELECT COUNT(*)
      INTO v_affected
      FROM public.employee_incentives
      WHERE created_at < (p_reference_time - make_interval(days => v_policy.retention_days));

    ELSE
      v_affected := 0;
    END IF;

    RETURN QUERY SELECT v_policy.table_name, v_policy.enforcement_action, v_affected;
  END LOOP;
END;
$$;

ALTER TABLE public.hr_compliance_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_data_retention_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and HR managers can view HR compliance access logs" ON public.hr_compliance_access_logs;
CREATE POLICY "Admins and HR managers can view HR compliance access logs"
  ON public.hr_compliance_access_logs FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

DROP POLICY IF EXISTS "Admins and HR managers can view retention policies" ON public.hr_data_retention_policies;
CREATE POLICY "Admins and HR managers can view retention policies"
  ON public.hr_data_retention_policies FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

DROP POLICY IF EXISTS "Admins and HR managers can manage retention policies" ON public.hr_data_retention_policies;
CREATE POLICY "Admins and HR managers can manage retention policies"
  ON public.hr_data_retention_policies FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

GRANT EXECUTE ON FUNCTION public.log_hr_compliance_access(TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_hr_data_retention(BOOLEAN, TIMESTAMPTZ) TO authenticated;
GRANT SELECT ON public.hr_compliance_access_logs TO authenticated;
GRANT SELECT ON public.hr_data_retention_policies TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.hr_compliance_access_logs FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.hr_data_retention_policies FROM anon;

DROP TRIGGER IF EXISTS prevent_hr_compliance_access_logs_mutation ON public.hr_compliance_access_logs;
CREATE TRIGGER prevent_hr_compliance_access_logs_mutation
  BEFORE UPDATE OR DELETE ON public.hr_compliance_access_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_hr_compliance_access_logs_mutation();
