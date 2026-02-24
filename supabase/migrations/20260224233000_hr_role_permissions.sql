-- Role-based permissions for HR data
-- Admin + HR Manager full access, Supervisor restricted view by department

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'hr_manager'
      AND enumtypid = 'app_role'::regtype
  ) THEN
    ALTER TYPE app_role ADD VALUE 'hr_manager';
  END IF;
END $$;

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

CREATE OR REPLACE FUNCTION public.can_supervisor_view_employee(p_user_id UUID, p_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role_name(p_user_id, 'supervisor')
    AND EXISTS (
      SELECT 1
      FROM public.employees target
      JOIN public.employees self_emp ON self_emp.user_id = p_user_id
      WHERE target.id = p_employee_id
        AND self_emp.department IS NOT NULL
        AND target.department = self_emp.department
    );
$$;

-- Employment contracts
DROP POLICY IF EXISTS "Authenticated users can view contracts" ON public.employment_contracts;
DROP POLICY IF EXISTS "Managers and admins can manage contracts" ON public.employment_contracts;

CREATE POLICY "Admins and HR managers can manage contracts"
  ON public.employment_contracts FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Supervisors can view contracts in their department"
  ON public.employment_contracts FOR SELECT
  USING (
    public.can_supervisor_view_employee(auth.uid(), public.employment_contracts.employee_id)
  );

-- Compensation rates
DROP POLICY IF EXISTS "Authenticated users can view compensation rates" ON public.compensation_rates;
DROP POLICY IF EXISTS "Managers and admins can manage compensation rates" ON public.compensation_rates;

CREATE POLICY "Admins and HR managers can manage compensation rates"
  ON public.compensation_rates FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Supervisors can view compensation rates in their department"
  ON public.compensation_rates FOR SELECT
  USING (
    public.can_supervisor_view_employee(auth.uid(), public.compensation_rates.employee_id)
  );

-- Leave balances
DROP POLICY IF EXISTS "Authenticated users can view leave balances" ON public.leave_balances;
DROP POLICY IF EXISTS "Managers supervisors and admins can manage leave balances" ON public.leave_balances;

CREATE POLICY "Admins and HR managers can manage leave balances"
  ON public.leave_balances FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Supervisors can view leave balances in their department"
  ON public.leave_balances FOR SELECT
  USING (
    public.can_supervisor_view_employee(auth.uid(), public.leave_balances.employee_id)
  );

-- Leave requests
DROP POLICY IF EXISTS "Authenticated users can view leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Authenticated users can create leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Managers supervisors and admins can update leave requests" ON public.leave_requests;

CREATE POLICY "Admins and HR managers can manage leave requests"
  ON public.leave_requests FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Supervisors can view leave requests in their department"
  ON public.leave_requests FOR SELECT
  USING (
    public.can_supervisor_view_employee(auth.uid(), public.leave_requests.employee_id)
  );

-- Incentive rules
DROP POLICY IF EXISTS "Authenticated users can view incentive rules" ON public.incentive_rules;
DROP POLICY IF EXISTS "Managers and admins can manage incentive rules" ON public.incentive_rules;

CREATE POLICY "Admins and HR managers can manage incentive rules"
  ON public.incentive_rules FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Supervisors can view incentive rules"
  ON public.incentive_rules FOR SELECT
  USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Employee incentives
DROP POLICY IF EXISTS "Authenticated users can view employee incentives" ON public.employee_incentives;
DROP POLICY IF EXISTS "Managers and admins can manage employee incentives" ON public.employee_incentives;

CREATE POLICY "Admins and HR managers can manage employee incentives"
  ON public.employee_incentives FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Supervisors can view employee incentives in their department"
  ON public.employee_incentives FOR SELECT
  USING (
    public.can_supervisor_view_employee(auth.uid(), public.employee_incentives.employee_id)
  );

-- HR documents
DROP POLICY IF EXISTS "Authenticated users can view HR documents" ON public.hr_documents;
DROP POLICY IF EXISTS "Managers and admins can manage HR documents" ON public.hr_documents;

CREATE POLICY "Admins and HR managers can manage HR documents"
  ON public.hr_documents FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Supervisors can view HR documents in their department"
  ON public.hr_documents FOR SELECT
  USING (
    public.can_supervisor_view_employee(auth.uid(), public.hr_documents.employee_id)
  );

-- Leave policies (HR management table)
DROP POLICY IF EXISTS "Managers and admins can manage leave policies" ON public.leave_policies;

CREATE POLICY "Admins and HR managers can manage leave policies"
  ON public.leave_policies FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
  );

DROP POLICY IF EXISTS "Authenticated users can view leave policies" ON public.leave_policies;
CREATE POLICY "Supervisors HR managers and admins can view leave policies"
  ON public.leave_policies FOR SELECT
  USING (
    has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role_name(auth.uid(), 'hr_manager')
    OR has_role(auth.uid(), 'admin'::app_role)
  );
