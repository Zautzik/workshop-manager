/**
 * Single source of truth for the `machine_status` Postgres enum.
 *
 * This file is intentionally free of React, Supabase client, and any other
 * runtime dependency so it can be safely imported by both:
 *   - Server-side API route handlers (src/app/api/machines/)
 *   - Client-side hooks and components (src/hooks/use-machines.ts)
 *
 * Mirrors: Database['public']['Enums']['machine_status'] in
 *   src/integrations/supabase/types.ts
 *
 * When the DB enum changes, update this file and TypeScript will surface
 * every call-site that needs updating — no more silent drift.
 */

export const MACHINE_STATUS_VALUES = [
	'idle',
	'running',
	'maintenance',
	'offline',
	'setup',
	'breakdown',
] as const;

export type MachineStatus = (typeof MACHINE_STATUS_VALUES)[number];
