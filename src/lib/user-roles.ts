import { supabaseAdmin } from '@/integrations/supabase/server';

/**
 * The role of each auth user — read from `user_roles`, the one table that owns
 * it (it is what the Users page writes and what requireAuth checks).
 *
 * Diagnósticos used to read `user_metadata.role`, which nothing sets, so every
 * user showed as "unknown" while the Users page showed the right roles
 * (audit H6, 2026-11-25). Both now call this.
 *
 * Throws on a failed read: "everyone has no role" must never be shown when the
 * truth is "the lookup failed".
 */
export interface UserRoleRow {
  id: string;
  user_id: string;
  role: string;
  department?: string | null;
  manager_domain?: string | null;
}

export async function rolesByUserId(userIds: string[]): Promise<Map<string, UserRoleRow>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await supabaseAdmin.from('user_roles').select('*').in('user_id', userIds);
  if (error) throw new Error(`No se pudieron leer los roles: ${error.message}`);
  return new Map(((data ?? []) as UserRoleRow[]).map((r) => [r.user_id, r]));
}
