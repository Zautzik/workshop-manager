import { supabaseAdmin } from '@/integrations/supabase/server';

/**
 * Identity & Presence resolver (ports & adapters). One interface resolves a
 * station badge-in signal to an employee; concrete adapters plug in behind it:
 *   - qr     : employees.badge_code → employee (the default)
 *   - manual : value is the employee id (supervisor fallback)
 *
 * Server-only.
 *
 * ── El adaptador de reconocimiento facial se eliminó (2026-10-15) ──────────
 *
 * Había un tercer método, `face`, que era un stub: lanzaba
 * `FACE_ADAPTER_NOT_CONFIGURED` y esperaba que algún día se conectara el sistema
 * de la empresa. Se saca por decisión del dueño, y la razón es legal antes que
 * técnica.
 *
 * Un rasgo facial es dato biométrico, y la Ley 21.719 —vigente el 2026-12-01—
 * lo trata como dato sensible: exige base de licitud reforzada, evaluación de
 * impacto y un deber de seguridad mayor. Un stub no procesa nada, pero sí
 * declara una intención: aparecía en el tipo `IdentityMethod`, o sea en el
 * contrato público de este módulo, y la auditoría de 2026-10 lo marcó como algo
 * que no conviene terminar a la ligera.
 *
 * Mantener la opción abierta tenía un costo y ningún beneficio: nadie la podía
 * usar, y cualquiera que leyera el tipo asumiría que el camino está previsto.
 * Si alguna vez se retoma, se retoma con asesoría legal y una evaluación de
 * impacto, no reemplazando un `throw`.
 *
 * El marcaje sigue funcionando igual: credencial QR por defecto, y resolución
 * manual como respaldo del supervisor. Ninguna de las dos es biométrica.
 */
export type IdentityMethod = 'qr' | 'manual';

export interface ResolvedIdentity {
  employee_id: string;
  full_name: string | null;
}

async function resolveByBadge(code: string): Promise<ResolvedIdentity | null> {
  const { data } = await supabaseAdmin
    .from('employees')
    .select('id, full_name')
    .eq('badge_code', code)
    .maybeSingle();
  return data ? { employee_id: data.id, full_name: data.full_name ?? null } : null;
}

async function resolveByEmployeeId(id: string): Promise<ResolvedIdentity | null> {
  const { data } = await supabaseAdmin
    .from('employees')
    .select('id, full_name')
    .eq('id', id)
    .maybeSingle();
  return data ? { employee_id: data.id, full_name: data.full_name ?? null } : null;
}

/** Resolve a badge-in signal to an employee via the method's adapter. */
export async function resolveIdentity(method: IdentityMethod, value: string): Promise<ResolvedIdentity | null> {
  switch (method) {
    case 'qr':     return resolveByBadge(value);
    case 'manual': return resolveByEmployeeId(value);
    default:       return null;
  }
}
