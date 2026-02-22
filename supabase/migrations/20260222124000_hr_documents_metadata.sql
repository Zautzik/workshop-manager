-- HR documents metadata: contracts and certifications with expiry tracking

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_document_type') THEN
    CREATE TYPE public.hr_document_type AS ENUM ('contract', 'certification', 'policy', 'training', 'other');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_document_status') THEN
    CREATE TYPE public.hr_document_status AS ENUM ('active', 'expired', 'archived');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.hr_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  doc_type public.hr_document_type NOT NULL DEFAULT 'other',
  issuer TEXT,
  issue_date DATE,
  expires_on DATE,
  reminder_days_before INTEGER NOT NULL DEFAULT 30,
  remind_on DATE,
  status public.hr_document_status NOT NULL DEFAULT 'active',
  file_url TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_documents_reminder_valid CHECK (reminder_days_before >= 0)
);

CREATE INDEX IF NOT EXISTS idx_hr_documents_employee_id ON public.hr_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_documents_expires_on ON public.hr_documents(expires_on);
CREATE INDEX IF NOT EXISTS idx_hr_documents_status ON public.hr_documents(status);

CREATE OR REPLACE FUNCTION public.set_hr_document_remind_on()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.expires_on IS NOT NULL THEN
    NEW.remind_on := NEW.expires_on - (NEW.reminder_days_before || ' days')::INTERVAL;
  ELSE
    NEW.remind_on := NULL;
  END IF;

  IF NEW.expires_on IS NOT NULL AND NEW.expires_on < CURRENT_DATE THEN
    NEW.status := 'expired';
  ELSIF NEW.status = 'expired' AND (NEW.expires_on IS NULL OR NEW.expires_on >= CURRENT_DATE) THEN
    NEW.status := 'active';
  END IF;

  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_hr_document_remind_on ON public.hr_documents;
CREATE TRIGGER set_hr_document_remind_on
  BEFORE INSERT OR UPDATE ON public.hr_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_hr_document_remind_on();

DROP TRIGGER IF EXISTS update_hr_documents_updated_at ON public.hr_documents;
CREATE TRIGGER update_hr_documents_updated_at
  BEFORE UPDATE ON public.hr_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.hr_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view HR documents" ON public.hr_documents;
CREATE POLICY "Authenticated users can view HR documents"
  ON public.hr_documents FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Managers and admins can manage HR documents" ON public.hr_documents;
CREATE POLICY "Managers and admins can manage HR documents"
  ON public.hr_documents FOR ALL
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );
