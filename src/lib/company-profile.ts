import { supabaseAdmin } from '@/integrations/supabase/server';

/**
 * The shop's own name and contact — one row, `app_settings.key = 'company'`.
 *
 * Every place that speaks to a customer as the shop reads it here: the public
 * tracking page (audit H3: it said "GonsAdmin", the app's name), and next the
 * printed quote and emails (audit M12: a personal Gmail was the company
 * contact). Nothing hard-codes a name.
 *
 * Unset → nulls; callers show no name rather than a wrong one.
 */
export interface CompanyProfile {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export const COMPANY_SETTINGS_KEY = 'company';

export async function getCompanyProfile(): Promise<CompanyProfile> {
  const { data, error } = await supabaseAdmin.from('app_settings').select('value').eq('key', COMPANY_SETTINGS_KEY).maybeSingle();
  // A failed read is an error, not "no profile": callers decide how to degrade.
  if (error) throw new Error(`No se pudo leer el perfil de la empresa: ${error.message}`);
  const v = ((data as { value?: unknown } | null)?.value ?? {}) as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : null);
  return { name: str(v.name), email: str(v.email), phone: str(v.phone) };
}
