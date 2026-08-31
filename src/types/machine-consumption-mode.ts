/**
 * Single source of truth for `machines.consumption_mode`.
 *
 * Free of React/Supabase-client dependencies, same reasoning as
 * machine-status.ts: importable from both API routes and client hooks.
 *
 * Mirrors the CHECK constraint added in
 * supabase/migrations/20260901120000_consumption_mode_por_maquina.sql.
 */

export const MACHINE_CONSUMPTION_MODE_VALUES = ['scan', 'backflush', 'off'] as const;

export type MachineConsumptionMode = (typeof MACHINE_CONSUMPTION_MODE_VALUES)[number];

export const MACHINE_CONSUMPTION_MODE_LABEL: Record<MachineConsumptionMode, string> = {
	scan: 'Escaneo manual',
	backflush: 'Backflush automático',
	off: 'No consume papel',
};

export const MACHINE_CONSUMPTION_MODE_HINT: Record<MachineConsumptionMode, string> = {
	scan: 'Un operario escanea el lote en /operaciones/escanear. Es el comportamiento de siempre.',
	backflush:
		'Al cerrar la etapa, el sistema descuenta solo los pliegos estándar de la OT (ots.calc_sheets), sin escaneo. No actúa si el papel exacto es ambiguo o le falta certificado vigente.',
	off: 'Esta máquina no consume papel (troqueladoras, por ejemplo) — no se ofrece el recordatorio de escanear.',
};
