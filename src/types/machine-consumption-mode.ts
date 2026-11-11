/**
 * Single source of truth for `machines.consumption_mode`.
 *
 * Free of React/Supabase-client dependencies, same reasoning as
 * machine-status.ts: importable from both API routes and client hooks.
 *
 * Mirrors the CHECK constraint added in
 * supabase/migrations/20260901120000_consumption_mode_por_maquina.sql.
 *
 * Sin 'backflush' desde 2026-11-11: el papel sale de bodega una vez, al entrar
 * la OT a la primera etapa de su ruta, con el lote y los pliegos que de verdad
 * salieron (paper-issue.ts). Descontar los pliegos cotizados al dejar la etapa
 * contradecía esa regla. La migración 20261111130000 pasó a 'scan' cualquier
 * máquina que lo tuviera.
 */

export const MACHINE_CONSUMPTION_MODE_VALUES = ['scan', 'off'] as const;

export type MachineConsumptionMode = (typeof MACHINE_CONSUMPTION_MODE_VALUES)[number];

export const MACHINE_CONSUMPTION_MODE_LABEL: Record<MachineConsumptionMode, string> = {
	scan: 'Escaneo manual',
	off: 'No consume papel',
};

export const MACHINE_CONSUMPTION_MODE_HINT: Record<MachineConsumptionMode, string> = {
	scan: 'Un operario escanea el lote en /operaciones/escanear (tintas, o papel extra para una reimpresión). El papel de la OT sale al entrar a su primera etapa.',
	off: 'Esta máquina no consume papel (troqueladoras, por ejemplo) — no se ofrece el recordatorio de escanear.',
};
