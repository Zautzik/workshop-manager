import { supabaseAdmin } from '@/integrations/supabase/server';
import type { AppRole } from '@/types/app-role';

/**
 * A caller's sales-ownership scope, derived from their role + employee mapping.
 *
 * - admin / manager / supervisor → full view (`all: true`).
 * - vendedor → only rows they own (`salesman_id = their employees.id`).
 *
 * The mapping is `auth.uid()` → `employees.user_id` → `employees.id`, and
 * `employees.id` is exactly what `clients.salesman_id`, `ots.salesman_id` and
 * `vistos_buenos.salesman_id` reference (see 20260628140000_visto_bueno…).
 */
export interface SalesScope {
  /** True when the caller may see every sales row (ops/management roles). */
  all: boolean;
  /** The employees.id the caller owns rows as, when scoped. null = owns nothing. */
  salesmanId: string | null;
}

// A UUID that matches no real row — used as the filter value when a scoped
// caller has no employee mapping, so the query returns empty instead of all.
const NO_MATCH_UUID = '00000000-0000-0000-0000-000000000000';

const FULL_VIEW_ROLES: ReadonlyArray<AppRole> = ['admin', 'manager', 'supervisor'];

/**
 * Resolve the caller's sales scope. A scoped caller with no `employees` record
 * (no `user_id` link) owns nothing — callers MUST treat `all: false` +
 * `salesmanId: null` as "empty result", never as "see everything".
 */
export async function resolveSalesScope(auth: {
  id: string;
  role: AppRole | null;
}): Promise<SalesScope> {
  if (auth.role && FULL_VIEW_ROLES.includes(auth.role)) {
    return { all: true, salesmanId: null };
  }

  // vendedor (or any non-full-view role): scope to their own employee id.
  const { data } = await supabaseAdmin
    .from('employees')
    .select('id')
    .eq('user_id', auth.id)
    .maybeSingle();

  return { all: false, salesmanId: data?.id ?? null };
}

/**
 * The salesman_id to filter a scoped query by. Returns a guaranteed-no-match
 * UUID when the caller owns nothing, so the result set is safely empty.
 */
export function scopeFilterId(scope: SalesScope): string {
  return scope.salesmanId ?? NO_MATCH_UUID;
}

/**
 * Whether a caller may act on (sign/convert/edit) a sales row owned by
 * `ownerSalesmanId`. Full-view roles always may; a scoped caller only if the
 * row is theirs. Guards against a vendedor mutating a peer's row by id.
 */
export function canActOnSalesRow(
  scope: SalesScope,
  ownerSalesmanId: string | null | undefined
): boolean {
  if (scope.all) return true;
  return !!scope.salesmanId && scope.salesmanId === ownerSalesmanId;
}
