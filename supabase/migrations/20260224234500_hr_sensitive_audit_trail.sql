-- HR sensitive changes audit trail
-- Scope: salary, contracts, leave approvals, incentive edits

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

CREATE TABLE IF NOT EXISTS public.hr_sensitive_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'APPROVAL_UPDATE')),
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  old_data JSONB,
  new_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_hr_sensitive_audit_log_table_name ON public.hr_sensitive_audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_hr_sensitive_audit_log_employee_id ON public.hr_sensitive_audit_log(employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_sensitive_audit_log_changed_at ON public.hr_sensitive_audit_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_sensitive_audit_log_changed_by ON public.hr_sensitive_audit_log(changed_by);

COMMENT ON TABLE public.hr_sensitive_audit_log IS
'Immutable audit trail for HR-sensitive mutations (salary, contract, leave approvals, incentive edits).';

CREATE OR REPLACE FUNCTION public.log_hr_sensitive_audit_event(
  p_table_name TEXT,
  p_record_id UUID,
  p_employee_id UUID,
  p_action TEXT,
  p_old_data JSONB,
  p_new_data JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed_by UUID;
  v_changed_fields TEXT[] := ARRAY[]::TEXT[];
BEGIN
  v_changed_by := auth.uid();

  IF p_action IN ('UPDATE', 'APPROVAL_UPDATE') THEN
    SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::TEXT[])
    INTO v_changed_fields
    FROM (
      SELECT k
      FROM (
        SELECT jsonb_object_keys(COALESCE(p_old_data, '{}'::jsonb)) AS k
        UNION
        SELECT jsonb_object_keys(COALESCE(p_new_data, '{}'::jsonb)) AS k
      ) all_keys
      WHERE (COALESCE(p_old_data, '{}'::jsonb) -> k)
            IS DISTINCT FROM
            (COALESCE(p_new_data, '{}'::jsonb) -> k)
    ) diffs;
  END IF;

  INSERT INTO public.hr_sensitive_audit_log (
    table_name,
    record_id,
    employee_id,
    action,
    changed_by,
    changed_fields,
    old_data,
    new_data
  )
  VALUES (
    p_table_name,
    p_record_id,
    p_employee_id,
    p_action,
    v_changed_by,
    v_changed_fields,
    p_old_data,
    p_new_data
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_audit_hr_sensitive_table_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_data JSONB;
  v_new_data JSONB;
  v_record_id UUID;
  v_employee_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_data := NULL;
    v_new_data := to_jsonb(NEW);
  ELSE
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
  END IF;

  v_record_id := NULLIF(COALESCE(v_new_data ->> 'id', v_old_data ->> 'id'), '')::UUID;
  v_employee_id := NULLIF(COALESCE(v_new_data ->> 'employee_id', v_old_data ->> 'employee_id'), '')::UUID;

  PERFORM public.log_hr_sensitive_audit_event(
    TG_TABLE_NAME,
    v_record_id,
    v_employee_id,
    TG_OP,
    v_old_data,
    v_new_data
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_audit_leave_approval_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.approved_by IS DISTINCT FROM NEW.approved_by
    OR OLD.approved_at IS DISTINCT FROM NEW.approved_at
    OR OLD.review_notes IS DISTINCT FROM NEW.review_notes
  )
  AND NEW.status IN ('approved'::public.leave_request_status, 'rejected'::public.leave_request_status, 'cancelled'::public.leave_request_status)
  THEN
    PERFORM public.log_hr_sensitive_audit_event(
      'leave_requests',
      NEW.id,
      NEW.employee_id,
      'APPROVAL_UPDATE',
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_hr_sensitive_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'hr_sensitive_audit_log is immutable and cannot be modified';
END;
$$;

ALTER TABLE public.hr_sensitive_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and HR managers can view HR sensitive audit log" ON public.hr_sensitive_audit_log;
CREATE POLICY "Admins and HR managers can view HR sensitive audit log"
  ON public.hr_sensitive_audit_log FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

GRANT SELECT ON public.hr_sensitive_audit_log TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.hr_sensitive_audit_log FROM authenticated, anon;

DROP TRIGGER IF EXISTS prevent_hr_sensitive_audit_log_mutations ON public.hr_sensitive_audit_log;
CREATE TRIGGER prevent_hr_sensitive_audit_log_mutations
  BEFORE UPDATE OR DELETE ON public.hr_sensitive_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_hr_sensitive_audit_log_mutation();

-- Contracts
DROP TRIGGER IF EXISTS audit_employment_contracts_changes ON public.employment_contracts;
CREATE TRIGGER audit_employment_contracts_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.employment_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_hr_sensitive_table_changes();

-- Salary / compensation rates
DROP TRIGGER IF EXISTS audit_compensation_rates_changes ON public.compensation_rates;
CREATE TRIGGER audit_compensation_rates_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.compensation_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_hr_sensitive_table_changes();

-- Leave approvals only
DROP TRIGGER IF EXISTS audit_leave_approval_changes ON public.leave_requests;
CREATE TRIGGER audit_leave_approval_changes
  AFTER UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_leave_approval_changes();

-- Incentive edits
DROP TRIGGER IF EXISTS audit_incentive_rules_changes ON public.incentive_rules;
CREATE TRIGGER audit_incentive_rules_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.incentive_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_hr_sensitive_table_changes();

DROP TRIGGER IF EXISTS audit_employee_incentives_changes ON public.employee_incentives;
CREATE TRIGGER audit_employee_incentives_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.employee_incentives
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_hr_sensitive_table_changes();
