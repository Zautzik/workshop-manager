/**
 * Single source of truth for the `inventory_tx_type` Postgres enum.
 *
 * Free of React/Supabase-client dependencies — same reasoning as
 * machine-status.ts: importable from both API routes and client hooks.
 *
 * The column is still a real Postgres ENUM (not free text): adding a
 * genuinely NEW code needs `ALTER TYPE ... ADD VALUE` plus a row in
 * `movement_types`, which stays a migration, not a self-service admin
 * action — see MovementTypesManager.tsx. What IS safe to edit at runtime,
 * per code, lives in `movement_types` (label, active, requires_ot,
 * sort_order); `direction` stays read-only there too, on purpose: flipping
 * it would invert the sign of every future transaction of that type against
 * `inventory_lots.quantity_available`.
 */

export const MOVEMENT_TYPE_CODE_VALUES = [
	'purchase',
	'consumption',
	'adjustment_in',
	'adjustment_out',
	'return_to_stock',
] as const;

export type MovementTypeCode = (typeof MOVEMENT_TYPE_CODE_VALUES)[number];
