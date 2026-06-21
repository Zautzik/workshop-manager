import { supabaseAdmin } from '@/integrations/supabase/server';

/**
 * Identity & Presence resolver (ports & adapters). One interface resolves a
 * station badge-in signal to an employee; concrete adapters plug in behind it:
 *   - qr     : employees.badge_code → employee (the default)
 *   - manual : value is the employee id (supervisor fallback)
 *   - face   : the company's face-recognition system (stub — slots in later)
 *
 * Server-only. Casts to any are intentional bridges until the
 * attendance_identity migration is applied and types.ts is regenerated
 * (employees.badge_code is added by that migration).
 */
export type IdentityMethod = 'qr' | 'face' | 'manual';

export interface ResolvedIdentity {
  employee_id: string;
  full_name: string | null;
}

async function resolveByBadge(code: string): Promise<ResolvedIdentity | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin.from('employees') as any)
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

// Face-recognition adapter — pluggable. The company has a system to integrate;
// it implements this same contract and replaces the throw.
async function resolveByFace(_value: string): Promise<ResolvedIdentity | null> {
  throw new Error('FACE_ADAPTER_NOT_CONFIGURED');
}

/** Resolve a badge-in signal to an employee via the method's adapter. */
export async function resolveIdentity(method: IdentityMethod, value: string): Promise<ResolvedIdentity | null> {
  switch (method) {
    case 'qr':     return resolveByBadge(value);
    case 'manual': return resolveByEmployeeId(value);
    case 'face':   return resolveByFace(value);
    default:       return null;
  }
}
